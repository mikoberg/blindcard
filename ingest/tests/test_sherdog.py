import datetime as dt
from pathlib import Path

from blindcard_ingest.sources.sherdog import (
    parse_fighter_page,
    parse_search,
    record_before_bout,
)
from blindcard_ingest.sources.wikipedia.fighter_record import DEBUT, Record

FIXTURES = Path(__file__).parent / "fixtures" / "wikipedia"
PAGE = parse_fighter_page(
    (FIXTURES / "sherdog_fighter.html").read_text(encoding="utf-8"), "/fighter/x-1"
)
SEARCH = (FIXTURES / "sherdog_search.html").read_text(encoding="utf-8")


def test_the_search_gives_the_page_of_that_name_only_and_once() -> None:
    assert parse_search(SEARCH, "Sedriques Dumas") == ["/fighter/Sedriques-Dumas-288537"]
    assert parse_search(SEARCH, "Joshua Van") == ["/fighter/Joshua-Van-365973"]
    assert parse_search(SEARCH, "Nobody Known") == []


def test_the_pro_history_and_the_country_are_read() -> None:
    assert PAGE.country == "us"
    assert [(b.date, b.opponent, b.result) for b in PAGE.bouts] == [
        (dt.date(2026, 9, 26), "Luis Hernandez", "loss"),
        (dt.date(2026, 4, 25), "Second Rival", "no_contest"),
        (dt.date(2025, 11, 1), "Third Rival", "win"),
        (dt.date(2025, 3, 3), "Fourth Rival", "draw"),
        (dt.date(2020, 9, 24), "First Rival", "win"),
    ]  # the amateur table is not on the record


def test_the_record_before_a_bout_counts_only_earlier_bouts() -> None:
    # before the last bout: win, draw, win, no contest
    assert record_before_bout(PAGE.bouts, dt.date(2026, 9, 26), "Luis Hernandez") == Record(
        2, 0, 1, 1
    )
    # before the no contest: win, draw, win
    assert record_before_bout(PAGE.bouts, dt.date(2026, 4, 25), "Second Rival") == Record(
        2, 0, 1, 0
    )


def test_the_bouts_own_result_is_never_counted() -> None:
    """The last bout was a loss: it must not show up in the record going into it."""
    record = record_before_bout(PAGE.bouts, dt.date(2026, 9, 26), "Luis Hernandez")
    assert record is not None and record.losses == 0


def test_a_debut_is_zero_zero() -> None:
    assert record_before_bout(PAGE.bouts, dt.date(2020, 9, 24), "First Rival") == DEBUT


def test_it_needs_the_right_opponent_and_exactly_one_matching_bout() -> None:
    assert record_before_bout(PAGE.bouts, dt.date(2026, 9, 26), "Somebody Else") is None
    assert record_before_bout(PAGE.bouts, dt.date(2027, 1, 1), "Luis Hernandez") is None
    twice = (*PAGE.bouts, PAGE.bouts[0])
    assert record_before_bout(twice, dt.date(2026, 9, 26), "Luis Hernandez") is None


def test_a_page_without_a_history_has_no_bouts_and_unknown_country() -> None:
    page = parse_fighter_page("<html>nothing here</html>")
    assert page.bouts == () and page.country is None
