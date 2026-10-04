import datetime as dt
from pathlib import Path

import pytest

from blindcard_ingest.sources.wikipedia.fighter_record import (
    DEBUT,
    Record,
    parse_date,
    parse_record,
    parse_record_rows,
    record_before,
)

PAGE = (Path(__file__).parent / "fixtures" / "wikipedia" / "fighter_page.wikitext").read_text(
    encoding="utf-8"
)


@pytest.mark.parametrize(
    ("text", "record"),
    [
        ("18–5", Record(18, 5, 0, 0)),
        ("17-4-1", Record(17, 4, 1, 0)),
        ("16–4 (1)", Record(16, 4, 0, 1)),
        ("3–1–1 (1)", Record(3, 1, 1, 1)),
        ("15–3, 1 NC", Record(15, 3, 0, 1)),
        ("  7–1 ", Record(7, 1, 0, 0)),
    ],
)
def test_parse_record(text: str, record: Record) -> None:
    assert parse_record(text) == record


@pytest.mark.parametrize("text", ["", "Win", "N/A", "–"])
def test_parse_record_rejects_what_is_not_a_record(text: str) -> None:
    assert parse_record(text) is None


@pytest.mark.parametrize(
    ("text", "date"),
    [
        ("{{dts|2019|June|1|format=dmy}}", dt.date(2019, 6, 1)),
        ("{{dts|format=dmy|2016|September|3}}", dt.date(2016, 9, 3)),
        ("{{dts|2015|06|01}}", dt.date(2015, 6, 1)),
        ("{{dts|2019|Jun|1}}", None),  # an abbreviation we do not guess at
        ("July 18, 2026", dt.date(2026, 7, 18)),
        ("5 January 2015", dt.date(2015, 1, 5)),
        ("later this year", None),
    ],
)
def test_parse_date(text: str, date: dt.date | None) -> None:
    assert parse_date(text) == date


def test_only_the_professional_mma_table_is_read() -> None:
    rows = parse_record_rows(PAGE)
    assert [r.opponent for r in rows] == [
        "Jon Jones",
        "Alexander Gustafsson",
        "Some Opponent",
        "Third Opponent",
        "Fourth Opponent",
        "First Opponent",
    ]  # not the wrestling table, not the amateur one
    assert rows[0].after == Record(3, 1, 1, 1)
    assert rows[0].date == dt.date(2018, 12, 29)


def test_a_page_without_a_record_table_has_no_rows() -> None:
    assert parse_record_rows("Just some text\n== Early life ==\nNothing.") == []


def test_the_record_before_a_bout_is_the_record_of_the_row_before_it() -> None:
    rows = parse_record_rows(PAGE)
    # UFC 232 (Dec 2018): the record after the previous row (Gustafsson, Sep 2016)
    assert record_before(rows, dt.date(2018, 12, 29), "Jon Jones") == Record(3, 0, 1, 1)
    # a middle bout
    assert record_before(rows, dt.date(2016, 9, 3), "Alexander Gustafsson") == Record(2, 0, 1, 1)


def test_the_bouts_own_record_is_never_returned() -> None:
    """The row of the bout carries the record AFTER it: that would give the result away."""
    rows = parse_record_rows(PAGE)
    own_after = rows[0].after
    assert record_before(rows, dt.date(2018, 12, 29), "Jon Jones") != own_after


def test_a_debut_has_a_zero_record() -> None:
    rows = parse_record_rows(PAGE)
    assert record_before(rows, dt.date(2014, 5, 2), "First Opponent") == DEBUT


def test_the_date_may_be_a_day_off_for_events_outside_the_us() -> None:
    rows = parse_record_rows(PAGE)
    assert record_before(rows, dt.date(2018, 12, 30), "Jon Jones") == Record(3, 0, 1, 1)
    assert record_before(rows, dt.date(2018, 12, 27), "Jon Jones") is None


def test_it_needs_the_right_opponent_and_exactly_one_matching_row() -> None:
    rows = parse_record_rows(PAGE)
    assert record_before(rows, dt.date(2018, 12, 29), "Somebody Else") is None  # wrong opponent
    assert record_before(rows, dt.date(2020, 1, 1), "Jon Jones") is None  # no such bout
    twice = [*rows, rows[0]]
    assert record_before(twice, dt.date(2018, 12, 29), "Jon Jones") is None  # ambiguous


def test_a_flag_icon_and_link_markup_in_the_opponent_cell_is_cleaned() -> None:
    rows = parse_record_rows(PAGE)
    assert rows[1].opponent == "Alexander Gustafsson"


def test_the_template_block_may_end_with_a_table_close_instead_of_end() -> None:
    block = (
        "== Mixed martial arts record ==\n{{MMArecordbox\n| nc=\n}}\n{{MMA record start}}\n"
        "|-\n|{{yes2}}Win\n|align=center|2\u20130\n|Second Opponent\n|KO\n|[[Show 2]]\n"
        "|{{dts|2020|May|2}}\n|1\n|0:30\n|Place\n|\n"
        "|-\n|{{yes2}}Win\n|align=center|1\u20130\n|First Opponent\n|KO\n|[[Show 1]]\n"
        "|{{dts|2019|May|2}}\n|1\n|0:30\n|Place\n|\n|}\n\n== Other ==\n"
    )
    rows = parse_record_rows(block)
    assert [r.opponent for r in rows] == ["Second Opponent", "First Opponent"]
    assert record_before(rows, dt.date(2020, 5, 2), "Second Opponent") == Record(1, 0, 0, 0)
