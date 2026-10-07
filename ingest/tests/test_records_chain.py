from __future__ import annotations

import datetime as dt

from blindcard_ingest.records_chain import MAX_GAP_DAYS, ChainFight, chain_records

DAY = dt.date(2024, 1, 1)


def rec(wins: int, losses: int, draws: int = 0, nc: int = 0) -> dict[str, int]:
    return {"w": wins, "l": losses, "d": draws, "nc": nc}


def fight(
    n: int,
    a: str,
    b: str,
    *,
    days: int,
    a_rec: dict[str, int] | None = None,
    b_rec: dict[str, int] | None = None,
    outcome: str | None = "win",
    winner: str | None = "a",
) -> ChainFight:
    stored = {k: v for k, v in (("a", a_rec), ("b", b_rec)) if v is not None}
    return ChainFight(
        fight_source_id=f"f{n}",
        event_date=DAY + dt.timedelta(days=days),
        a_source_id=a,
        b_source_id=b,
        stored_records=stored or None,
        outcome=outcome,
        winner=winner,
    )


def test_a_missing_record_follows_from_the_fight_before_it() -> None:
    fights = [
        fight(1, "x", "o1", days=0, a_rec=rec(5, 1), b_rec=rec(2, 2)),  # x wins
        fight(2, "x", "o2", days=120, b_rec=rec(0, 0)),  # x's record is missing
    ]
    assert chain_records(fights) == {"f2": {"a": rec(6, 1)}}


def test_a_missing_record_follows_from_the_fight_after_it() -> None:
    fights = [
        fight(1, "x", "o1", days=0, b_rec=rec(1, 0), winner="b"),  # x loses
        fight(2, "x", "o2", days=100, a_rec=rec(5, 3), b_rec=rec(0, 0)),
    ]
    assert chain_records(fights) == {"f1": {"a": rec(5, 2)}}


def test_a_chain_of_gaps_is_filled_from_the_known_end() -> None:
    fights = [
        fight(1, "x", "o1", days=0, a_rec=rec(1, 0), b_rec=rec(0, 0)),
        fight(2, "x", "o2", days=90, b_rec=rec(0, 0)),
        fight(3, "x", "o3", days=180, b_rec=rec(0, 0), winner="b"),
        fight(4, "x", "o4", days=270, b_rec=rec(0, 0)),
    ]
    got = chain_records(fights)
    assert got["f2"]["a"] == rec(2, 0)
    assert got["f3"]["a"] == rec(3, 0)
    assert got["f4"]["a"] == rec(3, 1)  # the loss in fight 3 is in the record going into 4


def test_a_draw_and_a_no_contest_are_counted_as_what_they_are() -> None:
    fights = [
        fight(1, "x", "o1", days=0, a_rec=rec(3, 0), b_rec=rec(0, 0), outcome="draw", winner=None),
        fight(2, "x", "o2", days=80, b_rec=rec(0, 0), outcome="no_contest", winner=None),
        fight(3, "x", "o3", days=160, b_rec=rec(0, 0)),
    ]
    got = chain_records(fights)
    assert got["f2"]["a"] == rec(3, 0, 1)
    assert got["f3"]["a"] == rec(3, 0, 1, 1)


def test_a_fight_without_a_known_result_is_not_bridged() -> None:
    fights = [
        fight(1, "x", "o1", days=0, a_rec=rec(5, 1), b_rec=rec(2, 2), outcome=None, winner=None),
        fight(2, "x", "o2", days=100, b_rec=rec(0, 0)),
    ]
    assert chain_records(fights) == {}


def test_an_outside_bout_in_between_stops_the_chain() -> None:
    fights = [
        fight(1, "x", "o1", days=0, a_rec=rec(5, 1), b_rec=rec(2, 2)),
        fight(2, "x", "o2", days=200, b_rec=rec(0, 0)),
    ]
    assert chain_records(fights, {"x": [DAY + dt.timedelta(days=100)]}) == {}
    # a bout before or after the gap does not matter
    assert chain_records(fights, {"x": [DAY - dt.timedelta(days=100)]}) == {"f2": {"a": rec(6, 1)}}


def test_a_long_gap_is_not_bridged_without_knowing_the_career() -> None:
    fights = [
        fight(1, "x", "o1", days=0, a_rec=rec(5, 1), b_rec=rec(2, 2)),
        fight(2, "x", "o2", days=MAX_GAP_DAYS + 1, b_rec=rec(0, 0)),
    ]
    assert chain_records(fights) == {}


def test_numbers_that_do_not_fit_leave_the_record_empty() -> None:
    fights = [
        fight(1, "x", "o1", days=0, b_rec=rec(1, 0), winner="b"),  # x loses
        fight(2, "x", "o2", days=100, a_rec=rec(5, 0), b_rec=rec(0, 0)),  # but has no losses after
    ]
    assert chain_records(fights) == {}


def test_a_record_already_stored_is_never_replaced() -> None:
    fights = [
        fight(1, "x", "o1", days=0, a_rec=rec(5, 1), b_rec=rec(2, 2)),
        fight(2, "x", "o2", days=100, a_rec=rec(9, 9), b_rec=rec(0, 0)),
    ]
    assert chain_records(fights) == {}


def test_both_fighters_of_one_fight_are_filled_from_their_own_neighbours() -> None:
    fights = [
        fight(1, "x", "y", days=0, a_rec=rec(4, 0), b_rec=rec(7, 2), winner="a"),
        fight(2, "x", "y", days=100, winner="b"),  # a rematch; both records are missing
    ]
    assert chain_records(fights) == {"f2": {"a": rec(5, 0), "b": rec(7, 3)}}
