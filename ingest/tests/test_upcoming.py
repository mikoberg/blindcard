"""Upcoming events: announced cards, read before the fight, pre-fight facts only."""

from __future__ import annotations

import datetime as dt
from collections.abc import Sequence

from fakes import FakeRepository

from blindcard_ingest.upcoming import parse_location, parse_upcoming_card
from blindcard_ingest.upcoming_pipeline import run_ingest_upcoming

CARD = """
{{Infobox MMA event
|name = UFC Fight Night: Allen vs. Duncan
|venue = [[UFC Apex|Meta Apex]]
|city = [[Enterprise, Nevada]], United States
}}
==Fight card==
{{MMAevent}}
{{MMAevent card|Fight card (Paramount+)}}
{{MMAevent bout
|Middleweight
|[[Brendan Allen]]
|vs.
|[[Christian Leroy Duncan]]
|
|
|
|
}}
{{MMAevent bout
|Women's Flyweight
|[[Ann Champ]] (c)
|vs.
|Bea Challenger
|
|
|
|
}}
{{MMAevent card|Preliminary card (Paramount+)|header=no}}
{{MMAevent bout
|Lightweight
|Francisco Prado
|vs.
|Ismael Bonfim
|
|
|
|
}}
{{MMAevent end|notes=yes}}
"""

FOUGHT = CARD.replace(
    "|Francisco Prado\n|vs.\n|Ismael Bonfim\n|\n|\n|\n|\n",
    "|Francisco Prado\n|def.\n|Ismael Bonfim\n|[[Decision (boxing)|Decision]]\n|3\n|5:00\n|\n",
)


def test_bouts_come_in_article_order_with_weight_class_and_segment() -> None:
    card = parse_upcoming_card(CARD)
    assert card is not None and not card.has_results
    assert [(b.position, b.a, b.b) for b in card.bouts] == [
        (1, "Brendan Allen", "Christian Leroy Duncan"),
        (2, "Ann Champ", "Bea Challenger"),
        (3, "Francisco Prado", "Ismael Bonfim"),
    ]
    assert [b.weight_class for b in card.bouts] == [
        "Middleweight",
        "Women's Flyweight",
        "Lightweight",
    ]
    # a lone "Fight card" followed by a "Preliminary card" is the main card
    assert [b.segment for b in card.bouts] == ["main", "main", "prelim"]


def test_a_champion_mark_means_a_title_fight_and_is_stripped_from_the_name() -> None:
    card = parse_upcoming_card(CARD)
    assert card is not None
    assert [b.is_title_fight for b in card.bouts] == [False, True, False]


def test_a_note_about_the_title_is_not_a_result_and_marks_a_title_fight() -> None:
    text = CARD.replace(
        "|Bea Challenger\n|\n|\n|\n|\n",
        "|Bea Challenger\n|\n|\n|\n|For the UFC Women's Flyweight Championship.\n",
    ).replace("[[Ann Champ]] (c)", "[[Ann Champ]]")
    card = parse_upcoming_card(text)
    assert card is not None and not card.has_results
    assert [b.is_title_fight for b in card.bouts] == [False, True, False]


def test_a_card_that_shows_any_result_is_flagged() -> None:
    card = parse_upcoming_card(FOUGHT)
    assert card is not None and card.has_results


def test_a_single_fight_card_has_no_segments() -> None:
    text = CARD.replace("{{MMAevent card|Preliminary card (Paramount+)|header=no}}", "")
    card = parse_upcoming_card(text)
    assert card is not None
    assert {b.segment for b in card.bouts} == {None}


def test_no_bouts_is_none_and_the_location_comes_from_the_infobox() -> None:
    assert parse_upcoming_card("==Background==\nNothing announced.") is None
    assert parse_location(CARD) == "Meta Apex, Enterprise, Nevada, United States"
    assert parse_location("no infobox") is None


LIST = """
{| class="wikitable"
|-
| [[UFC Fight Night: Allen vs. Duncan]] || {{dts|2026|Oct|10}}
|-
| [[UFC Fight Night: Today vs. Tonight]] || {{dts|2026|Oct|5}}
|-
| [[UFC 333]] || {{dts|2026|Oct|24}}
|-
| [[UFC Fight Night: Old vs. Older]] || {{dts|2026|Sep|26}}
|}
"""


class FakeWiki:
    def __init__(self, pages: dict[str, str]) -> None:
        self.pages = pages
        self.requested: list[str] = []
        self.max_age: float | None = None

    def events_list_wikitext(self) -> str:
        return LIST

    def page_wikitexts(
        self, titles: Sequence[str], *, max_age_seconds: float | None = None
    ) -> dict[str, str]:
        self.requested = list(titles)
        self.max_age = max_age_seconds
        return {t: self.pages[t] for t in titles if t in self.pages}


TODAY = dt.date(2026, 10, 5)


def test_only_events_strictly_after_today_are_read_and_pages_stay_fresh() -> None:
    wiki = FakeWiki({"UFC Fight Night: Allen vs. Duncan": CARD, "UFC 333": "==Background=="})
    repo = FakeRepository()
    report = run_ingest_upcoming(wiki, repo, today=TODAY)
    # the event of today and the one in the past are never fetched
    assert sorted(wiki.requested) == ["UFC 333", "UFC Fight Night: Allen vs. Duncan"]
    assert wiki.max_age is not None and wiki.max_age <= 24 * 3600
    assert report.events_stored == 2 and report.events_without_page == 0
    by_name = {e.name: e for e in repo.upcoming}
    assert len(by_name["UFC Fight Night: Allen vs. Duncan"].bouts) == 3
    assert by_name["UFC 333"].bouts == ()  # announced, no card yet
    assert repo.upcoming_today == TODAY


def test_an_article_that_already_shows_results_is_never_stored() -> None:
    wiki = FakeWiki({"UFC Fight Night: Allen vs. Duncan": FOUGHT})
    repo = FakeRepository()
    report = run_ingest_upcoming(wiki, repo, today=TODAY)
    assert report.events_refused == 1
    assert all(e.name != "UFC Fight Night: Allen vs. Duncan" for e in repo.upcoming)


def test_a_fighter_is_linked_only_when_exactly_one_stored_fighter_has_that_name() -> None:
    wiki = FakeWiki({"UFC Fight Night: Allen vs. Duncan": CARD})
    repo = FakeRepository(
        fighters=[
            ("id-allen", "Brendan Allen"),
            ("id-duncan-1", "Christian Leroy Duncan"),
            ("id-duncan-2", "Christian Leroy Duncan"),  # two of them: never guess
            ("id-prado", "Francisco Prado"),
        ]
    )
    run_ingest_upcoming(wiki, repo, today=TODAY)
    assert repo.upcoming_fighter_ids == {
        "Brendan Allen": "id-allen",
        "Francisco Prado": "id-prado",
    }


def test_a_dry_run_writes_nothing() -> None:
    wiki = FakeWiki({"UFC Fight Night: Allen vs. Duncan": CARD, "UFC 333": "==Background=="})
    repo = FakeRepository()
    report = run_ingest_upcoming(wiki, repo, today=TODAY, dry_run=True)
    assert report.events_stored == 2
    assert repo.upcoming == []


def test_a_current_record_is_the_going_in_record_of_the_last_fight_plus_its_result() -> None:
    from blindcard_ingest.upcoming_records import current_record

    going_in = {"w": 10, "l": 2, "d": 0, "nc": 0}
    assert current_record(going_in, "win", True) == {"w": 11, "l": 2, "d": 0, "nc": 0}
    assert current_record(going_in, "win", False) == {"w": 10, "l": 3, "d": 0, "nc": 0}
    assert current_record(going_in, "draw", None) == {"w": 10, "l": 2, "d": 1, "nc": 0}
    assert current_record(going_in, "no_contest", None) == {"w": 10, "l": 2, "d": 0, "nc": 1}
    assert going_in == {"w": 10, "l": 2, "d": 0, "nc": 0}  # the stored record is not touched


def test_no_record_is_made_up_when_a_part_is_missing() -> None:
    from blindcard_ingest.upcoming_records import current_record

    assert current_record(None, "win", True) is None  # no going-in record stored
    assert current_record({"w": 1, "l": 0}, "win", True) is None  # an incomplete one
    assert current_record({"w": 1, "l": 0, "d": 0, "nc": 0}, "win", None) is None  # winner unknown
    assert current_record({"w": 1, "l": 0, "d": 0, "nc": 0}, "mystery", True) is None


def test_the_pipeline_hands_the_records_of_matched_fighters_to_the_repository() -> None:
    wiki = FakeWiki({"UFC Fight Night: Allen vs. Duncan": CARD, "UFC 333": "==Background=="})
    repo = FakeRepository(
        fighters=[("id-allen", "Brendan Allen"), ("id-prado", "Francisco Prado")],
        current_records={
            "id-allen": {"w": 25, "l": 6, "d": 0, "nc": 0},
            "id-stranger": {"w": 1, "l": 1, "d": 0, "nc": 0},
        },
    )
    run_ingest_upcoming(wiki, repo, today=TODAY)
    # only the records of fighters on the card are stored; a debut or unmatched fighter has none
    assert repo.upcoming_records == {"id-allen": {"w": 25, "l": 6, "d": 0, "nc": 0}}
