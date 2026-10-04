import datetime as dt
import json
import logging
from collections.abc import Sequence
from pathlib import Path

import pytest
from fakes import FakeRepository

from blindcard_ingest.bonus_pipeline import run_ingest_bonuses
from blindcard_ingest.models import (
    EventBundle,
    ParsedEvent,
    ParsedFight,
    ParsedFighter,
    order_fighters,
)
from blindcard_ingest.sources.wikipedia.bonuses import (
    FIGHT_OF_THE_NIGHT,
    PERFORMANCE_OF_THE_NIGHT,
)

SOURCE = "ufcstats"


def fighter(name: str) -> ParsedFighter:
    return ParsedFighter(source_id=f"name:{name.lower().replace(' ', '-')}", name=name)


def fight(fight_id: str, position: int, a: str, b: str) -> ParsedFight:
    fa, fb = order_fighters(fighter(a), fighter(b))
    return ParsedFight(source_id=fight_id, card_position=position, fighter_a=fa, fighter_b=fb)


def bundle(event_id: str, name: str, date: dt.date, fights: list[ParsedFight]) -> EventBundle:
    return EventBundle(
        event=ParsedEvent(source_id=event_id, name=name, event_date=date), fights=fights
    )


def list_row(title: str, display: str, date: dt.date) -> str:
    month = date.strftime("%b")
    return f"|-\n|1\n|[[{title}|{display}]]\n|{{{{dts|{date.year}|{month}|{date.day}}}}}\n"


def page(fotn: str = "", potn: str = "") -> str:
    lines = ["==Results==", "text", "==Bonus awards=="]
    if fotn:
        lines.append(f"*'''Fight of the Night: {fotn}'''")
    if potn:
        lines.append(f"*'''Performance of the Night: {potn}'''")
    return "\n".join(lines) + "\n"


class FakeWiki:
    def __init__(self, rows: list[str], pages: dict[str, str]) -> None:
        self._list = "==Past events==\n{|\n" + "".join(rows) + "|}\n"
        self._pages = pages
        self.requested: list[str] = []

    def events_list_wikitext(self) -> str:
        return self._list

    def page_wikitexts(self, titles: Sequence[str]) -> dict[str, str]:
        self.requested = list(titles)
        return {t: self._pages[t] for t in titles if t in self._pages}


D1, D2, D3, D4 = (
    dt.date(2024, 4, 13),
    dt.date(2024, 5, 4),
    dt.date(2024, 6, 1),
    dt.date(2022, 1, 1),
)


@pytest.fixture
def repo() -> FakeRepository:
    repository = FakeRepository()
    repository.upsert_event_bundle(
        SOURCE,
        "UFC",
        bundle(
            "e1",
            "UFC 300: Pereira vs. Hill",
            D1,
            [
                fight("e1-f1", 1, "Alex Pereira", "Jamahal Hill"),
                fight("e1-f2", 2, "Max Holloway", "Justin Gaethje"),
                fight("e1-f3", 3, "Jiri Prochazka", "Aleksandar Rakic"),
            ],
        ),
    )
    repository.upsert_event_bundle(
        SOURCE,
        "UFC",
        bundle(
            "e2", "UFC 301: Pantoja vs. Erceg", D2, [fight("e2-f1", 1, "Josh Van", "Pantoja X")]
        ),
    )
    repository.upsert_event_bundle(
        SOURCE, "UFC", bundle("e3", "UFC 302", D3, [fight("e3-f1", 1, "Aa Bb", "Cc Dd")])
    )
    repository.upsert_event_bundle(
        SOURCE, "UFC", bundle("e4", "UFC 250", D4, [fight("e4-f1", 1, "Ee Ff", "Gg Hh")])
    )
    return repository


def wiki(pages: dict[str, str]) -> FakeWiki:
    return FakeWiki(
        [
            list_row("UFC 300", "UFC 300: Pereira vs. Hill", D1),
            list_row("UFC 301", "UFC 301: Pantoja vs. Erceg", D2),
            list_row("UFC 302", "UFC 302", D3),
            list_row("UFC 250", "UFC 250", D4),
        ],
        pages,
    )


def test_awards_are_matched_per_event_and_stored_on_the_right_fights(repo: FakeRepository) -> None:
    pages = {
        "UFC 300": page(
            fotn="Max Holloway vs. Justin Gaethje",
            potn="Max Holloway and Jiří Procházka",
        ),
        "UFC 301": page(potn="Josh Van"),
    }
    report = run_ingest_bonuses(wiki(pages), repo, source_name=SOURCE, from_year=2023)

    assert repo.bonuses == {
        "e1-f2": [FIGHT_OF_THE_NIGHT, PERFORMANCE_OF_THE_NIGHT],
        "e1-f3": [PERFORMANCE_OF_THE_NIGHT],
        "e2-f1": [PERFORMANCE_OF_THE_NIGHT],
    }
    assert report.events_considered == 3  # e4 is before from_year
    assert report.events_labeled == 2
    assert report.fights_fight_of_the_night == 1
    assert report.fights_performance_of_the_night == 3
    assert report.awards_in_labeled_events == 4  # 1 fight + 2 performances, then 1 performance


def test_an_event_with_an_unmatched_award_is_left_entirely_untouched(
    repo: FakeRepository,
) -> None:
    pages = {
        "UFC 300": page(potn="Max Holloway and Somebody Unknown"),
        "UFC 301": page(potn="Josh Van"),
    }
    report = run_ingest_bonuses(wiki(pages), repo, source_name=SOURCE, from_year=2023)

    assert repo.bonuses == {"e2-f1": [PERFORMANCE_OF_THE_NIGHT]}  # nothing for UFC 300
    assert report.events_incomplete == 1 and report.events_labeled == 1


def test_missing_page_missing_section_and_no_awards_are_counted_not_stored(
    repo: FakeRepository,
) -> None:
    pages = {
        "UFC 300": "==Results==\nno bonus section here\n",
        "UFC 301": "==Bonus awards==\nThe bonuses were not announced.\n",
    }  # UFC 302 has no page at all
    report = run_ingest_bonuses(wiki(pages), repo, source_name=SOURCE, from_year=2023)

    assert repo.bonuses == {}
    assert (report.events_without_section, report.events_without_awards) == (1, 1)
    assert report.events_without_page == 1
    assert report.events_labeled == 0


def test_dry_run_stores_nothing_but_reports(repo: FakeRepository) -> None:
    pages = {"UFC 301": page(potn="Josh Van")}
    report = run_ingest_bonuses(wiki(pages), repo, source_name=SOURCE, from_year=2023, dry_run=True)
    assert repo.bonuses == {}
    assert report.events_labeled == 1


def test_a_re_run_gives_the_same_state(repo: FakeRepository) -> None:
    pages = {"UFC 301": page(potn="Josh Van")}
    run_ingest_bonuses(wiki(pages), repo, source_name=SOURCE, from_year=2023)
    first = dict(repo.bonuses)
    run_ingest_bonuses(wiki(pages), repo, source_name=SOURCE, from_year=2023)
    assert repo.bonuses == first


def test_only_events_from_the_given_year_are_looked_up(repo: FakeRepository) -> None:
    source = wiki({})
    run_ingest_bonuses(source, repo, source_name=SOURCE, from_year=2023)
    assert "UFC 250" not in source.requested


def test_logs_carry_counts_only_and_names_go_to_the_local_report(
    repo: FakeRepository, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    pages = {"UFC 300": page(fotn="Max Holloway vs. Justin Gaethje", potn="Nobody Known")}
    report_path = tmp_path / "bonus_report.json"

    run_ingest_bonuses(
        wiki(pages), repo, source_name=SOURCE, from_year=2023, report_path=report_path
    )

    for name in ("Holloway", "Gaethje", "Nobody Known", "fight_of_the_night"):
        assert name not in caplog.text
    details = json.loads(report_path.read_text("utf-8"))
    incomplete = next(d for d in details if d["event_source_id"] == "e1")
    assert incomplete["status"] == "incomplete"
    assert incomplete["unresolved_names"] == ["Nobody Known"]
