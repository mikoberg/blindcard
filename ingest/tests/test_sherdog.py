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


def test_search_matches_names_with_apostrophes_and_dots() -> None:
    html = (
        '<a href="/fighter/Loneer-Kavanagh-213249">x</a>'
        '<a href="/fighter/Casey-ONeill-175007">x</a>'
        '<a href="/fighter/TJ-Dillashaw-52814">x</a>'
        '<a href="/fighter/Joshua-Van-365973">x</a>'
    )
    assert parse_search(html, "Lone'er Kavanagh") == ["/fighter/Loneer-Kavanagh-213249"]
    assert parse_search(html, "Casey O’Neill") == ["/fighter/Casey-ONeill-175007"]
    assert parse_search(html, "T.J. Dillashaw") == ["/fighter/TJ-Dillashaw-52814"]


def test_search_matches_a_fuller_name_and_names_written_with_other_spacing() -> None:
    html = (
        '<a href="/fighter/Ilimbek-Akylbek-Uulu-388255">x</a>'
        '<a href="/fighter/Joo-Sang-Yoo-387629">x</a>'
        '<a href="/fighter/Michael-Aswell-286497">x</a>'
        '<a href="/fighter/Luis-Fernando-Silva-1">x</a>'
    )
    assert parse_search(html, "Ilimbek Akylbek") == ["/fighter/Ilimbek-Akylbek-Uulu-388255"]
    assert parse_search(html, "JooSang Yoo") == ["/fighter/Joo-Sang-Yoo-387629"]
    assert parse_search(html, "Michael Aswell Jr.") == ["/fighter/Michael-Aswell-286497"]
    assert parse_search(html, "Silva") == []  # a single word is never matched loosely


def test_queries_try_the_name_without_suffix_and_with_split_words() -> None:
    from blindcard_ingest.sources.sherdog import _queries

    assert _queries("Michael Aswell Jr.") == ["Michael Aswell Jr.", "Michael Aswell"]
    assert _queries("JooSang Yoo") == ["JooSang Yoo", "Joo Sang Yoo"]
    assert _queries("Ann Lee") == ["Ann Lee"]


def test_the_method_event_and_round_of_each_bout_are_read_for_the_career_list() -> None:
    first = PAGE.bouts[0]
    assert first.method == "Submission (Guillotine Choke)"
    assert first.event == "UFC Fight Night 289 - Rosas Jr. vs. Barcelos"
    assert first.round == 1


def test_the_career_leaves_out_the_bouts_we_store_ourselves() -> None:
    from blindcard_ingest.sources.sherdog import career_rows

    rows = career_rows(PAGE.bouts, {dt.date(2026, 9, 26), dt.date(2026, 4, 25)})
    assert [(r.date, r.result) for r in rows] == [
        (dt.date(2020, 9, 24), "win"),
        (dt.date(2025, 3, 3), "draw"),
        (dt.date(2025, 11, 1), "win"),
    ]
    assert rows[-1].after == Record(2, 0, 1, 0) and rows[-1].method == "KO"


def test_the_date_of_birth_is_read_from_the_page() -> None:
    html = '<td>AGE</td><td><b>31</b> <em>/</em> <span itemprop="birthDate">Aug 6, 1995</span></td>'
    assert parse_fighter_page(html).birth_date == dt.date(1995, 8, 6)
    assert parse_fighter_page("<td>AGE</td><td>unknown</td>").birth_date is None
    assert PAGE.birth_date is None  # the older fixture has none
