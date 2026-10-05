"""Who is favoured: Elo from past results, strictly pre-fight, refused unless it beats a coin."""

from __future__ import annotations

import datetime as dt
import random

import pytest
from fakes import FakeRepository

from blindcard_ingest.predict.picks import make_picks, run_predict_picks
from blindcard_ingest.predict.types import FightOutcome, UpcomingBoutInput
from blindcard_ingest.predict.winner import (
    EloTracker,
    build_pairs,
    fit_winner_model,
    walk_forward,
)


def outcome(fid: str, date: dt.date, a: str, b: str, a_won: bool) -> FightOutcome:
    return FightOutcome(fight_id=fid, event_date=date, a_id=a, b_id=b, a_won=a_won)


D1, D2, D3 = dt.date(2020, 1, 1), dt.date(2020, 6, 1), dt.date(2021, 1, 1)


def test_a_fight_never_sees_itself_or_another_fight_of_the_same_night() -> None:
    rows = [outcome("f1", D1, "A", "B", True), outcome("f2", D1, "A", "C", True)]
    examples, tracker = build_pairs(rows)
    assert examples[0].x == examples[1].x == (0.0,) * 7
    assert tracker.rating("A") > 1500 > tracker.rating("B")


def test_features_before_a_fight_do_not_depend_on_its_own_result() -> None:
    base = [outcome("f1", D1, "A", "B", True), outcome("f2", D2, "A", "C", True)]
    won = build_pairs([*base, outcome("f3", D3, "A", "D", True)])[0][2]
    lost = build_pairs([*base, outcome("f3", D3, "A", "D", False)])[0][2]
    assert won.x == lost.x and won.y != lost.y


def test_a_win_moves_the_ratings_and_newcomers_move_faster_than_veterans() -> None:
    tracker = EloTracker()
    tracker.add(outcome("f1", D1, "new", "new2", True))
    first_jump = tracker.rating("new") - 1500
    veteran = EloTracker()
    veteran.fights["vet"] = 30
    veteran.fights["vet2"] = 30
    veteran.add(outcome("f2", D1, "vet", "vet2", True))
    assert first_jump > veteran.rating("vet") - 1500 > 0


def synthetic(n_events: int = 400) -> list[FightOutcome]:
    """Fighters with a lasting strength: the stronger one wins about 75% of the time."""
    rng = random.Random(3)
    strength = {f"f{i}": rng.gauss(0, 1) for i in range(50)}
    rows: list[FightOutcome] = []
    date = dt.date(2012, 1, 1)
    for e in range(n_events):
        date += dt.timedelta(days=14)
        names = rng.sample(sorted(strength), 10)
        for s in range(5):
            a, b = names[2 * s], names[2 * s + 1]
            p = 1 / (1 + 2.718 ** (-(strength[a] - strength[b]) * 1.4))
            rows.append(outcome(f"e{e}s{s}", date, a, b, rng.random() < p))
    return rows


def test_the_walk_forward_check_clearly_beats_a_coin_on_learnable_data_and_never_peeks() -> None:
    examples, _ = build_pairs(synthetic())
    evaluation = walk_forward(examples, test_from_year=2014)
    assert evaluation.n > 500
    assert evaluation.accuracy > 0.6 and evaluation.log_loss < 0.69
    assert evaluation.clearly_beats_a_coin()


def test_the_model_cannot_learn_the_a_b_order() -> None:
    # fighter a wins exactly half the time in this data: the intercept stays at zero
    examples, _ = build_pairs(synthetic())
    model = fit_winner_model(examples)
    assert abs(model.intercept) < 1e-6
    assert model.p_first((0.0,) * 7) == pytest.approx(0.5)


def test_picks_name_the_favoured_side_and_say_how_much_history_they_rest_on() -> None:
    rows = synthetic()
    strongest = max({r.a_id for r in rows}, key=lambda f: build_pairs(rows)[1].rating(f))
    weakest = min({r.a_id for r in rows}, key=lambda f: build_pairs(rows)[1].rating(f))
    bouts = [
        UpcomingBoutInput("b1", 1, 4, None, False, strongest, weakest),
        UpcomingBoutInput("b2", 2, 4, None, False, weakest, strongest),
        UpcomingBoutInput("b3", 3, 4, None, False, strongest, None),
        UpcomingBoutInput("b4", 4, 4, None, False, None, None),
    ]
    picks, evaluation, _ = make_picks(rows, bouts, test_from_year=2014)
    by = {p.bout_id: p for p in picks}
    assert (
        by["b1"].favoured == "a" and by["b2"].favoured == "b"
    )  # side follows the fighter, not the slot
    assert by["b1"].basis == "both" and by["b3"].basis == "one"
    assert "b4" not in by  # nobody known: no pick
    assert all(0.5 <= p.probability <= 1 for p in picks)
    assert all(p.accuracy == pytest.approx(evaluation.accuracy, abs=1e-3) for p in picks)


def test_it_refuses_to_pick_when_it_does_not_clearly_beat_a_coin() -> None:
    rng = random.Random(5)
    rows = [
        outcome(
            f"r{i}",
            dt.date(2012, 1, 1) + dt.timedelta(days=7 * i),
            f"x{i % 40}",
            f"y{i % 37}",
            rng.random() < 0.5,
        )
        for i in range(1500)
    ]
    bouts = [UpcomingBoutInput("b1", 1, 1, None, False, "x1", "y1")]
    picks, evaluation, _ = make_picks(rows, bouts, test_from_year=2014)
    assert picks == []
    assert not evaluation.clearly_beats_a_coin()


def test_the_pipeline_stores_picks_and_a_dry_run_stores_none() -> None:
    rows = synthetic()
    bouts = [UpcomingBoutInput("b1", 1, 1, None, False, rows[0].a_id, rows[0].b_id)]
    repo = FakeRepository(outcome_rows=rows, bout_inputs=bouts)
    report = run_predict_picks(repo)
    assert report.picks and repo.picks is not None and not report.refused
    dry = FakeRepository(outcome_rows=rows, bout_inputs=bouts)
    run_predict_picks(dry, dry_run=True)
    assert dry.picks is None


def test_logs_carry_counts_and_accuracy_never_a_name(caplog: pytest.LogCaptureFixture) -> None:
    rows = synthetic()
    bouts = [UpcomingBoutInput("b1", 1, 1, None, False, rows[0].a_id, rows[0].b_id)]
    with caplog.at_level("INFO"):
        run_predict_picks(FakeRepository(outcome_rows=rows, bout_inputs=bouts))
    text = " ".join(r.getMessage() for r in caplog.records)
    assert "predict-picks" in text and rows[0].a_id not in text


def test_an_earlier_meeting_counts_for_the_fighter_who_won_it_whichever_side_they_are_on() -> None:
    tracker = EloTracker()
    tracker.add(outcome("m1", D1, "yan", "merab", False))  # merab wins the first meeting
    tracker.add(outcome("m2", D2, "merab", "yan", False))  # yan wins the rematch (sides swapped)
    net, last = tracker._head_to_head("yan", "merab")
    assert (net, last) == (0.0, 1.0)  # one win each, and yan won the latest meeting
    assert tracker._head_to_head("merab", "yan") == (0.0, -1.0)  # flips with the order
    assert tracker._head_to_head("yan", "stranger") == (0.0, 0.0)
    assert tracker._head_to_head(None, "yan") == (0.0, 0.0)
    tracker.add(outcome("m3", D3, "yan", "merab", True))
    assert tracker._head_to_head("yan", "merab") == (1.0, 1.0)


def test_a_finish_moves_the_ratings_more_than_a_decision_and_a_split_less() -> None:
    from blindcard_ingest.predict.winner import dominance_of

    assert (
        dominance_of("KO/TKO")
        > dominance_of("Decision - Unanimous")
        > dominance_of("Decision - Split")
    )
    moved = []
    for d in (1.4, 1.0, 0.7):
        t = EloTracker()
        t.add(FightOutcome("f", D1, "a", "b", True, d))
        moved.append(t.rating("a") - 1500)
    assert moved[0] > moved[1] > moved[2] > 0
