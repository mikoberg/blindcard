"""compute-elo: the private Elo board. Only fighters with enough fights, strongest first."""

from __future__ import annotations

import datetime as dt

from fakes import FakeRepository

from blindcard_ingest.predict.elo_board import MIN_FIGHTS, build_board, run_compute_elo
from blindcard_ingest.predict.types import FightOutcome


def outcome(n: int, a: str, b: str, a_won: bool = True) -> FightOutcome:
    return FightOutcome(
        fight_id=f"f{n}",
        event_date=dt.date(2020, 1, 1) + dt.timedelta(days=30 * n),
        a_id=a,
        b_id=b,
        a_won=a_won,
    )


def many_wins(winner: str, loser_prefix: str, count: int) -> list[FightOutcome]:
    return [outcome(i, winner, f"{loser_prefix}{i}") for i in range(count)]


def test_only_fighters_with_enough_fights_are_listed_strongest_first() -> None:
    rows = build_board(many_wins("champ", "x", MIN_FIGHTS))
    assert [r.fighter_id for r in rows] == ["champ"]
    assert rows[0].fights == MIN_FIGHTS and rows[0].rating > 1500
    # the nine opponents fought once each: not on the board
    assert build_board(many_wins("champ", "x", MIN_FIGHTS - 1)) == []


def test_the_order_is_by_rating_with_the_id_as_a_stable_tiebreak() -> None:
    fights = [outcome(i, "a", "b", a_won=i % 4 != 0) for i in range(MIN_FIGHTS)]
    rows = build_board(fights)
    assert [r.fighter_id for r in rows] == ["a", "b"]
    assert rows[0].rating > rows[1].rating


def test_the_board_does_not_depend_on_the_order_the_fights_arrive_in() -> None:
    fights = [outcome(i, "a", f"o{i % 3}", a_won=i % 2 == 0) for i in range(20)]
    assert build_board(fights, min_fights=3) == build_board(list(reversed(fights)), min_fights=3)


def test_last_fight_is_the_date_of_their_latest_fight() -> None:
    rows = build_board(many_wins("champ", "x", MIN_FIGHTS))
    assert rows[0].last_fight == dt.date(2020, 1, 1) + dt.timedelta(days=30 * (MIN_FIGHTS - 1))


def test_run_stores_the_board_and_a_dry_run_stores_nothing() -> None:
    repo = FakeRepository()
    repo.outcome_rows = many_wins("champ", "x", MIN_FIGHTS)
    run_compute_elo(repo, dry_run=True)
    assert not hasattr(repo, "elo_rows")
    run_compute_elo(repo)
    assert [r.fighter_id for r in repo.elo_rows] == ["champ"]


def test_logs_carry_counts_only(caplog) -> None:  # type: ignore[no-untyped-def]
    repo = FakeRepository()
    repo.outcome_rows = many_wins("secret-name", "x", MIN_FIGHTS)
    with caplog.at_level("INFO"):
        run_compute_elo(repo)
    assert "secret-name" not in caplog.text and "1 fighters" in caplog.text
