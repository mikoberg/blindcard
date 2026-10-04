import datetime as dt
import json
from collections.abc import Sequence
from pathlib import Path

import pytest
from fakes import FakeRepository

from blindcard_ingest import cli
from blindcard_ingest.bonus_matching import FightNames
from blindcard_ingest.card_matching import (
    COMPLETE,
    COUNT_MISMATCH,
    ORDER_MISMATCH,
    SINGLE_CARD,
    UNMATCHED,
    resolve_segments,
)
from blindcard_ingest.models import (
    EventBundle,
    ParsedEvent,
    ParsedFight,
    ParsedFighter,
    order_fighters,
)
from blindcard_ingest.segment_pipeline import run_ingest_segments
from blindcard_ingest.sources.wikipedia.card import (
    EARLY_PRELIM,
    MAIN,
    PRELIM,
    CardBout,
    parse_card,
)

SOURCE = "ufcstats"

WIKITEXT = """==Results==
{{MMAevent}}
{{MMAevent card|Main Card}}
{{MMAevent bout
|Women's Bantamweight
|[[Ronda Rousey]] (c)
|def.
|[[Cat Zingano]]
|Submission (straight armbar)
|1
|0:14
|For the [[UFC Women's Bantamweight Championship|title]].
}}
{{MMAevent bout
|Welterweight
|[[Richard Walsh (fighter)|Richard Walsh]]
|def.
|{{flagicon|USA}} [[Alan Jouban]]
|KO
|1
|2:19
|
}}
{{MMAevent card|Preliminary Card (Fox Sports 1)|header=no}}
{{MMAevent bout|Middleweight|Roan Carneiro|vs.|Mark Muñoz|No Contest|2|2:37|}}
{{MMAevent card|Early Preliminary Card (UFC Fight Pass)|header=no}}
{{MMAevent bout
|Lightweight
|Valmir Lázaro
|def.
|[[James Krause (fighter)|James Krause]]
|Decision
|3
|5:00
|
}}
{{MMAevent end|notes=yes}}
==Bonus awards==
"""


def pair(a: str, b: str) -> tuple[str, str]:
    return (min(a, b), max(a, b))


# --- parser -------------------------------------------------------------------------------


def test_parse_card_reads_segments_and_unordered_pairs() -> None:
    bouts = parse_card(WIKITEXT)
    assert bouts is not None
    assert [(b.segment, b.names) for b in bouts] == [
        (MAIN, pair("Ronda Rousey", "Cat Zingano")),
        (MAIN, pair("Richard Walsh", "Alan Jouban")),
        (PRELIM, pair("Roan Carneiro", "Mark Muñoz")),
        (EARLY_PRELIM, pair("Valmir Lázaro", "James Krause")),
    ]


def test_parse_card_keeps_no_result_information() -> None:
    """The article lists the winner first and the method after it: none of that may survive."""
    bouts = parse_card(WIKITEXT) or ()
    # alphabetical, not "winner first": the source order (Rousey def. Zingano) is gone
    assert bouts[0].names == ("Cat Zingano", "Ronda Rousey")
    for bout in bouts:
        assert set(bout.__dataclass_fields__) == {"segment", "names"}
        text = " ".join(bout.names).lower()
        assert "armbar" not in text and "def" not in text and "decision" not in text


def test_champion_marks_and_flags_are_stripped_from_names() -> None:
    bouts = parse_card(WIKITEXT) or ()
    assert all("(c)" not in n and "flagicon" not in n for b in bouts for n in b.names)
    assert "Alan Jouban" in bouts[1].names


@pytest.mark.parametrize(
    ("header", "segment"),
    [
        ("Main Card", MAIN),
        ("Main card (ESPN+)", MAIN),
        ("Preliminary Card", PRELIM),
        ("Early Preliminary Card (UFC Fight Pass)", EARLY_PRELIM),
        ("Fight Card", None),
        ("Something Else", None),
    ],
)
def test_headers_map_to_segments_and_unknown_headers_to_none(
    header: str, segment: str | None
) -> None:
    text = f"{{{{MMAevent card|{header}}}}}\n{{{{MMAevent bout|W|A One|def.|B Two|KO|1|1:00|}}}}"
    assert parse_card(text) == (CardBout(segment, pair("A One", "B Two")),)


def test_an_article_without_bouts_has_no_card() -> None:
    assert parse_card("==Results==\nnothing here") is None
    assert parse_card("{{MMAevent card|Main Card}}") is None


def test_a_broken_template_is_skipped_not_fatal() -> None:
    assert parse_card("{{MMAevent card|Main Card}}\n{{MMAevent bout|W|A One|def.") is None


# --- matching -----------------------------------------------------------------------------

FIGHTS = (
    FightNames("f1", ("Ronda Rousey", "Cat Zingano")),
    FightNames("f2", ("Alan Jouban", "Richard Walsh")),
    FightNames("f3", ("Roan Carneiro", "Mark Munoz")),
    FightNames("f4", ("Valmir Lazaro", "James Krause")),
)


def bout(segment: str | None, a: str, b: str) -> CardBout:
    return CardBout(segment, pair(a, b))


FULL = [
    bout(MAIN, "Ronda Rousey", "Cat Zingano"),
    bout(MAIN, "Richard Walsh", "Alan Jouban"),
    bout(PRELIM, "Roan Carneiro", "Mark Muñoz"),
    bout(EARLY_PRELIM, "Valmir Lázaro", "James Krause"),
]


def test_a_full_card_is_resolved_fight_by_fight() -> None:
    resolution = resolve_segments(FULL, FIGHTS)
    assert resolution.status == COMPLETE
    assert resolution.segments_by_fight == {
        "f1": MAIN,
        "f2": MAIN,
        "f3": PRELIM,
        "f4": EARLY_PRELIM,
    }


def test_a_renamed_fighter_is_tolerated_when_the_opponent_matches() -> None:
    renamed = [*FULL[:3], bout(EARLY_PRELIM, "Valmir Lázaro", "James Krause Renamed Entirely")]
    fights = (*FIGHTS[:3], FightNames("f4", ("Valmir Lazaro", "Jim Newname")))
    assert resolve_segments(renamed, fights).status == COMPLETE


def test_a_bout_pointing_at_two_different_fights_is_refused() -> None:
    crossed = [*FULL[:3], bout(EARLY_PRELIM, "Valmir Lázaro", "Cat Zingano")]
    assert resolve_segments(crossed, FIGHTS).status == UNMATCHED


def test_a_bout_matching_nothing_is_refused() -> None:
    nothing = [*FULL[:3], bout(EARLY_PRELIM, "Somebody New", "Another Newcomer")]
    assert resolve_segments(nothing, FIGHTS).status == UNMATCHED


def test_two_bouts_claiming_the_same_fight_are_refused() -> None:
    twice = [*FULL[:3], bout(EARLY_PRELIM, "Roan Carneiro", "Mark Muñoz")]
    assert resolve_segments(twice, FIGHTS).status == UNMATCHED


def test_a_different_number_of_bouts_is_refused() -> None:
    assert resolve_segments(FULL[:3], FIGHTS).status == COUNT_MISMATCH


def test_a_plain_fight_card_has_no_segments() -> None:
    plain = [CardBout(None, b.names) for b in FULL]
    assert resolve_segments(plain, FIGHTS).status == SINGLE_CARD


def test_the_segment_order_must_follow_our_card_order() -> None:
    swapped = [
        FULL[0],
        FULL[1],
        bout(EARLY_PRELIM, "Roan Carneiro", "Mark Muñoz"),
        bout(PRELIM, "Valmir Lázaro", "James Krause"),
    ]
    assert resolve_segments(swapped, FIGHTS).status == ORDER_MISMATCH


# --- pipeline -----------------------------------------------------------------------------


def fighter(name: str) -> ParsedFighter:
    return ParsedFighter(source_id=f"name:{name.lower().replace(' ', '-')}", name=name)


def fight(fight_id: str, position: int, a: str, b: str) -> ParsedFight:
    fa, fb = order_fighters(fighter(a), fighter(b))
    return ParsedFight(source_id=fight_id, card_position=position, fighter_a=fa, fighter_b=fb)


def event_bundle(event_id: str, name: str, date: dt.date) -> EventBundle:
    fights = [
        fight(f"{event_id}-1", 1, "Ronda Rousey", "Cat Zingano"),
        fight(f"{event_id}-2", 2, "Alan Jouban", "Richard Walsh"),
        fight(f"{event_id}-3", 3, "Roan Carneiro", "Mark Munoz"),
        fight(f"{event_id}-4", 4, "Valmir Lazaro", "James Krause"),
    ]
    return EventBundle(
        event=ParsedEvent(source_id=event_id, name=name, event_date=date), fights=fights
    )


class FakeWiki:
    def __init__(self, pages: dict[str, tuple[dt.date, str]]) -> None:
        rows = "".join(
            f"|-\n|1\n|[[{title}|{title}]]\n|{{{{dts|{d.year}|{d.strftime('%b')}|{d.day}}}}}\n"
            for title, (d, _) in pages.items()
        )
        self._list = "==Past events==\n{|\n" + rows + "|}\n"
        self._pages = {title: text for title, (_, text) in pages.items()}

    def events_list_wikitext(self) -> str:
        return self._list

    def page_wikitexts(self, titles: Sequence[str]) -> dict[str, str]:
        return {t: self._pages[t] for t in titles if t in self._pages}


D1, D2, D3 = dt.date(2024, 4, 13), dt.date(2024, 5, 4), dt.date(2024, 6, 1)


def test_segments_are_stored_for_fully_matched_events_only(tmp_path: Path) -> None:
    repo = FakeRepository()
    repo.upsert_event_bundle(SOURCE, "UFC", event_bundle("e1", "UFC 300: Alpha", D1))
    repo.upsert_event_bundle(SOURCE, "UFC", event_bundle("e2", "UFC 301: Beta", D2))
    repo.upsert_event_bundle(SOURCE, "UFC", event_bundle("e3", "UFC 302: Gamma", D3))
    broken = WIKITEXT.replace("Mark Muñoz", "Somebody Else").replace("Roan Carneiro", "Another")
    wiki = FakeWiki({"UFC 300": (D1, WIKITEXT), "UFC 301": (D2, broken)})  # no page for e3
    report_path = tmp_path / "segment_report.json"

    report = run_ingest_segments(
        wiki, repo, source_name=SOURCE, from_year=2024, report_path=report_path
    )

    assert report.events_considered == 3 and report.events_segmented == 1
    assert report.events_without_page == 1 and report.statuses["unmatched"] == 1
    assert repo.segments == {
        "e1-1": MAIN,
        "e1-2": MAIN,
        "e1-3": PRELIM,
        "e1-4": EARLY_PRELIM,
    }
    detail = json.loads(report_path.read_text("utf-8"))
    assert {d["event_source_id"]: d["status"] for d in detail} == {
        "e1": "complete",
        "e2": "unmatched",
        "e3": "no_page",
    }


def test_a_dry_run_stores_nothing_and_logs_counts_only(caplog: pytest.LogCaptureFixture) -> None:
    repo = FakeRepository()
    repo.upsert_event_bundle(SOURCE, "UFC", event_bundle("e1", "UFC 300: Alpha", D1))
    wiki = FakeWiki({"UFC 300": (D1, WIKITEXT)})
    with caplog.at_level("INFO"):
        run_ingest_segments(wiki, repo, source_name=SOURCE, from_year=2024, dry_run=True)
    assert repo.segments == {}
    logged = " ".join(r.getMessage() for r in caplog.records)
    for secret in ("Rousey", "Zingano", "armbar", "Submission"):
        assert secret not in logged


def test_rerunning_changes_nothing() -> None:
    repo = FakeRepository()
    repo.upsert_event_bundle(SOURCE, "UFC", event_bundle("e1", "UFC 300: Alpha", D1))
    wiki = FakeWiki({"UFC 300": (D1, WIKITEXT)})
    run_ingest_segments(wiki, repo, source_name=SOURCE, from_year=2024)
    first = dict(repo.segments)
    run_ingest_segments(wiki, repo, source_name=SOURCE, from_year=2024)
    assert repo.segments == first


def test_the_cli_knows_ingest_segments() -> None:
    args = cli.build_parser().parse_args(["ingest-segments", "--from", "2020", "--dry-run"])
    assert (args.command, args.from_year, args.dry_run) == ("ingest-segments", 2020, True)
