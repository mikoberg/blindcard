"""compute-elo: standard Elo with experience-dependent K and credit for how a fight was decided."""

from __future__ import annotations

import datetime as dt

import pytest
from fakes import FakeRepository

from blindcard_ingest.predict.elo_board import (
    MIN_FIGHTS,
    START,
    build_board,
    build_ledger,
    current_elo,
    expected_score,
    pre_fight_elo,
    run_compute_elo,
    step_size,
)
from blindcard_ingest.predict.types import EloFight


def fight(
    n: int,
    a: str,
    b: str,
    *,
    a_won: bool = True,
    outcome: str = "win",
    how: str = "finish",
) -> EloFight:
    return EloFight(
        fight_id=f"f{n}",
        event_date=dt.date(2020, 1, 1) + dt.timedelta(days=30 * n),
        a_id=a,
        b_id=b,
        outcome=outcome,
        a_won=a_won,
        how=how,
    )


def wins(winner: str, prefix: str, count: int) -> list[EloFight]:
    return [fight(i, winner, f"{prefix}{i}") for i in range(count)]


def test_expected_score_is_the_standard_formula() -> None:
    assert expected_score(1500, 1500) == pytest.approx(0.5)
    assert expected_score(1900, 1500) == pytest.approx(10 / 11)  # 400 points: 10 to 1
    assert expected_score(1500, 1900) == pytest.approx(1 / 11)


def test_k_is_larger_for_newcomers_and_settles_for_veterans() -> None:
    assert step_size(0) == 90.0
    assert step_size(3) == 60.0
    assert step_size(30) < 36 and step_size(30) > 30
    assert all(step_size(n) > step_size(n + 1) for n in range(40))


def test_a_first_win_between_two_newcomers_moves_each_by_half_of_k() -> None:
    ledger = build_ledger([fight(1, "a", "b")])
    assert ledger.ratings == {"a": START + 45.0, "b": START - 45.0}
    a_step = next(s for s in ledger.steps if s.fighter_id == "a")
    assert (a_step.expected, a_step.k, a_step.score, a_step.change) == (0.5, 90.0, 1.0, 45.0)
    assert (a_step.rating_before, a_step.rating_after, a_step.how) == (
        1500.0,
        1545.0,
        "won by finish",
    )


def test_a_split_decision_is_worth_two_thirds_and_a_majority_five_sixths() -> None:
    split = build_ledger([fight(1, "a", "b", how="split decision")]).steps
    assert next(s for s in split if s.fighter_id == "a").score == 0.667
    assert next(s for s in split if s.fighter_id == "b").score == 0.333
    assert next(s for s in split if s.fighter_id == "a").change == pytest.approx(15.0, abs=0.1)
    majority = build_ledger([fight(1, "a", "b", how="majority decision")]).steps
    assert next(s for s in majority if s.fighter_id == "a").score == 0.833
    unanimous = build_ledger([fight(1, "a", "b", how="unanimous decision")]).steps
    assert next(s for s in unanimous if s.fighter_id == "a").score == 1.0


def test_a_draw_counts_half_each_and_changes_equals_not_at_all() -> None:
    ledger = build_ledger([fight(1, "a", "b", outcome="draw")])
    assert ledger.ratings == {"a": START, "b": START}
    assert {s.how for s in ledger.steps} == {"draw"} and {s.score for s in ledger.steps} == {0.5}


def test_the_loser_perspective_is_the_mirror_image() -> None:
    steps = build_ledger([fight(1, "a", "b", a_won=False)]).steps
    a = next(s for s in steps if s.fighter_id == "a")
    assert (a.score, a.how, a.change) == (0.0, "lost by finish", -45.0)


def test_every_step_starts_where_the_previous_one_ended() -> None:
    games = [fight(i, "a", f"o{i % 3}", a_won=i % 2 == 0) for i in range(12)]
    ledger = build_ledger(games)
    mine = [s for s in ledger.steps if s.fighter_id == "a"]
    assert [s.seq for s in mine] == list(range(1, 13))
    assert mine[0].rating_before == START
    for previous, step in zip(mine, mine[1:], strict=False):
        assert step.rating_before == previous.rating_after
    assert mine[-1].rating_after == pytest.approx(ledger.ratings["a"], abs=0.1)
    for s in mine:
        assert s.change == pytest.approx(s.k * (s.score - s.expected), abs=0.06)


def test_only_fighters_with_enough_fights_are_listed_with_their_steps() -> None:
    rows, steps = build_board(wins("champ", "x", MIN_FIGHTS))
    assert [r.fighter_id for r in rows] == ["champ"]
    assert rows[0].fights == MIN_FIGHTS and rows[0].rating > START
    assert {s.fighter_id for s in steps} == {"champ"} and len(steps) == MIN_FIGHTS
    assert build_board(wins("champ", "x", MIN_FIGHTS - 1)) == ([], [])


def test_the_board_is_strongest_first_and_ignores_the_order_fights_arrive_in() -> None:
    games = [fight(i, "a", f"o{i % 3}", a_won=i % 2 == 0) for i in range(20)]
    forward = build_board(games, min_fights=3)
    assert forward == build_board(list(reversed(games)), min_fights=3)
    ratings = [r.rating for r in forward[0]]
    assert ratings == sorted(ratings, reverse=True)


def test_last_fight_is_the_date_of_their_latest_fight() -> None:
    rows, _ = build_board(wins("champ", "x", MIN_FIGHTS))
    assert rows[0].last_fight == dt.date(2020, 1, 1) + dt.timedelta(days=30 * (MIN_FIGHTS - 1))


def test_run_stores_board_and_steps_and_a_dry_run_stores_nothing() -> None:
    repo = FakeRepository()
    repo.elo_fight_rows = wins("champ", "x", MIN_FIGHTS)
    run_compute_elo(repo, dry_run=True)
    assert not hasattr(repo, "elo_rows")
    run_compute_elo(repo)
    assert [r.fighter_id for r in repo.elo_rows] == ["champ"] and len(repo.elo_steps) == MIN_FIGHTS


def test_logs_carry_counts_only(caplog) -> None:  # type: ignore[no-untyped-def]
    repo = FakeRepository()
    repo.elo_fight_rows = wins("secret-name", "x", MIN_FIGHTS)
    with caplog.at_level("INFO"):
        run_compute_elo(repo)
    assert "secret-name" not in caplog.text and "1 fighters" in caplog.text


def test_the_peak_is_the_highest_rating_reached_and_when() -> None:
    # win, win, then losses: the peak is after the second win, not the final rating
    games = [
        fight(1, "a", "x1"),
        fight(2, "a", "x2"),
        *[fight(i, "z", "a") for i in range(3, 3 + MIN_FIGHTS)],
    ]
    rows, steps = build_board(games, min_fights=3)
    a = next(r for r in rows if r.fighter_id == "a")
    mine = [s for s in steps if s.fighter_id == "a"]
    assert a.peak == max(s.rating_after for s in mine) and a.peak > a.rating
    assert a.peak_date == next(s.fight_date for s in mine if s.rating_after == a.peak)
    assert a.peak_date == dt.date(2020, 1, 1) + dt.timedelta(days=60)


def test_a_fighter_who_only_rises_has_the_current_rating_as_the_peak() -> None:
    rows, _ = build_board(wins("champ", "x", MIN_FIGHTS))
    assert rows[0].peak == rows[0].rating and rows[0].peak_date == rows[0].last_fight


# --- the Elo going INTO a fight, which the cards show like the record going in ------------


def test_a_fights_pre_fight_ratings_come_from_earlier_fights_only() -> None:
    rows = {
        r.fight_id: r for r in pre_fight_elo(build_ledger([fight(1, "a", "b"), fight(2, "a", "c")]))
    }
    assert rows["f1"].a is None and rows["f1"].b is None  # a debut has nothing before it
    second = rows["f2"]
    assert second.a is not None and second.a.fights == 1 and second.a.rating == START + 45.0
    assert second.b is None  # c has not fought before


def test_the_pre_fight_rating_does_not_depend_on_the_fights_own_result() -> None:
    base = [fight(1, "a", "b"), fight(2, "a", "c")]
    won = pre_fight_elo(build_ledger([*base, fight(3, "a", "d", a_won=True)]))
    lost = pre_fight_elo(build_ledger([*base, fight(3, "a", "d", a_won=False)]))
    assert [f for f in won if f.fight_id == "f3"] == [f for f in lost if f.fight_id == "f3"]


def test_a_no_contest_gets_its_pre_fight_ratings_but_moves_nothing() -> None:
    games = [
        fight(1, "a", "b"),
        fight(2, "a", "b", outcome="none"),
        fight(3, "a", "b", a_won=False),
    ]
    ledger = build_ledger(games)
    rows = {r.fight_id: r for r in pre_fight_elo(ledger)}
    assert rows["f2"].a is not None and rows["f2"].a.fights == 1  # like any other fight on the card
    # the no contest left the ratings and the fight counts where they were
    assert rows["f3"].a == rows["f2"].a and rows["f3"].b == rows["f2"].b
    assert [s.seq for s in ledger.steps if s.fighter_id == "a"] == [1, 2]


def test_the_current_rating_of_an_announced_bout_includes_every_completed_fight() -> None:
    from blindcard_ingest.predict.types import UpcomingBoutInput

    ledger = build_ledger([fight(1, "a", "b")])
    bout = UpcomingBoutInput("u1", 1, 10, None, False, "a", "debut")
    [row] = current_elo(ledger, [bout])
    assert row.a is not None and row.a.rating == START + 45.0 and row.a.fights == 1
    assert row.b is None  # no earlier fight, or not in our data


def test_run_stores_pre_fight_and_upcoming_ratings_too_and_a_dry_run_none() -> None:
    repo = FakeRepository()
    repo.elo_fight_rows = wins("champ", "x", MIN_FIGHTS)
    run_compute_elo(repo, dry_run=True)
    assert not hasattr(repo, "fight_elo_rows") and not hasattr(repo, "upcoming_elo_rows")
    run_compute_elo(repo)
    assert len(repo.fight_elo_rows) == MIN_FIGHTS and repo.upcoming_elo_rows == []
