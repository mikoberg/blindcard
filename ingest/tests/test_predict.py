"""Expected-rating prediction: public data only, never from the future, honest about its limits."""

from __future__ import annotations

import datetime as dt
import random

import pytest
from fakes import FakeRepository

from blindcard_ingest.predict.dataset import FEATURES, FightRow, Tracker, build_examples
from blindcard_ingest.predict.evaluate import metrics, pearson, spearman, walk_forward
from blindcard_ingest.predict.model import fit_ridge
from blindcard_ingest.predict.pipeline import (
    HIGH,
    LOW,
    MIN_TRAINING_FIGHTS,
    predict_bouts,
    run_predict_upcoming,
)
from blindcard_ingest.predict.types import UpcomingBoutInput


def row(
    fight_id: str, date: dt.date, a: str, b: str, stars: float, position: int = 3, **kw
) -> FightRow:
    return FightRow(
        fight_id=fight_id,
        event_date=date,
        position=position,
        weight_class=kw.get("weight_class", "Lightweight"),
        is_title_fight=kw.get("title", False),
        a_id=a,
        b_id=b,
        stars=stars,
    )


D1, D2, D3 = dt.date(2020, 1, 1), dt.date(2020, 6, 1), dt.date(2021, 1, 1)


def feature(name: str, x: tuple[float, ...]) -> float:
    return x[FEATURES.index(name)]


def test_a_fight_never_sees_itself_or_another_fight_of_the_same_night() -> None:
    rows = [
        row("f1", D1, "A", "B", 5.0),
        row("f2", D1, "A", "C", 1.0),
        row("f3", D2, "A", "D", 3.0),
    ]
    examples, tracker = build_examples(rows)
    first, second, third = examples
    # nothing is known on the first night, whatever happened on it
    assert first.x == second.x
    assert feature("experience", first.x) == 0.0
    # the second night knows both of A's earlier fights, not its own
    assert feature("experience", third.x) == pytest.approx(0.0)  # D has no history
    assert len(tracker.stars_by_fighter["A"]) == 3


def test_features_do_not_change_when_a_later_result_changes() -> None:
    base = [
        row("f1", D1, "A", "B", 4.0),
        row("f2", D2, "A", "C", 3.0),
        row("f3", D3, "A", "D", 2.0),
    ]
    other = [*base[:2], row("f3", D3, "A", "D", 5.0)]
    x_base = build_examples(base)[0][2].x
    x_other = build_examples(other)[0][2].x
    # the target differs, the features of that very fight do not
    assert x_base == x_other
    # and a changed EARLIER rating does move the later fight's features
    earlier = [row("f1", D1, "A", "B", 1.0), *base[1:]]
    assert build_examples(earlier)[0][2].x != x_base


def test_a_fighter_with_little_history_is_pulled_toward_the_average() -> None:
    rows = [row(f"w{i}", D1, f"x{i}", f"y{i}", 3.0) for i in range(40)]
    rows.append(row("one", D2, "star", "z", 5.0))
    _, tracker = build_examples(rows)
    x = tracker.features("star", "newcomer", "Lightweight", 3, False, 10)
    # one great fight does not make an average of 5.0: it is shrunk toward the 3.0 of everyone
    assert 3.0 < feature("best_rating", x) < 4.0
    assert feature("worst_rating", x) == pytest.approx(3.0, abs=0.05)  # an unknown fighter


def test_main_event_and_division_context_come_from_the_card_alone() -> None:
    tracker = Tracker()
    main = tracker.features(None, None, "Women's Flyweight", 1, True, 12)
    prelim = tracker.features(None, None, "Lightweight", 9, False, 12)
    assert feature("main_event", main) == 1.0 and feature("main_event", prelim) == 0.0
    assert feature("title_fight", main) == 1.0
    assert feature("womens", main) == 1.0 and feature("womens", prelim) == 0.0
    assert feature("card_depth", main) == 0.0 and feature("card_depth", prelim) > 0.5


def test_ridge_recovers_a_linear_signal_and_reports_its_own_error() -> None:
    rng = random.Random(1)
    xs = [[rng.gauss(0, 1), rng.gauss(0, 1)] for _ in range(400)]
    ys = [3.0 + 0.8 * x[0] + rng.gauss(0, 0.3) for x in xs]
    model = fit_ridge(("signal", "noise"), xs, ys, l2=1.0)
    assert model.predict([1.0, 0.0]) == pytest.approx(3.8, abs=0.15)
    assert abs(model.weights[1]) < 0.1
    assert model.residual_sd == pytest.approx(0.3, abs=0.05)
    with pytest.raises(ValueError):
        fit_ridge(("a", "b"), [[1.0, 2.0]], [1.0], l2=1.0)


def test_rank_and_error_metrics() -> None:
    assert pearson([1, 2, 3], [2, 4, 6]) == pytest.approx(1.0)
    assert spearman([1, 2, 3, 4], [10, 20, 40, 30]) == pytest.approx(0.8)


def synthetic_rows(n_events: int = 120) -> list[FightRow]:
    """Fighters have a lasting entertainment level; main events get a bonus: learnable signal."""
    rng = random.Random(7)
    fighters = {f"f{i}": rng.uniform(-0.8, 0.8) for i in range(60)}
    rows: list[FightRow] = []
    date = dt.date(2012, 1, 1)
    for e in range(n_events):
        date += dt.timedelta(days=14)
        names = rng.sample(sorted(fighters), 10)
        for slot in range(5):
            a, b = names[2 * slot], names[2 * slot + 1]
            base = 3.0 + (fighters[a] + fighters[b]) / 2 + (0.8 if slot == 0 else 0.0)
            stars = max(1.0, min(5.0, round((base + rng.gauss(0, 0.5)) * 2) / 2))
            rows.append(row(f"e{e}s{slot}", date, a, b, stars, position=slot + 1))
    return rows


def test_walk_forward_beats_the_baselines_on_learnable_data_and_never_peeks() -> None:
    examples, _ = build_examples(synthetic_rows())
    result = walk_forward(examples, test_from_year=2016)
    assert result.examples and all(e.row.event_date.year >= 2016 for e in result.examples)
    full = metrics(result.examples, result.predictions["full"])
    context = metrics(result.examples, result.predictions["context"])
    constant = metrics(result.examples, result.predictions["constant"])
    assert full.mae < context.mae < constant.mae
    assert full.spearman > context.spearman


def test_predictions_stay_in_range_and_say_how_much_history_they_rest_on() -> None:
    rows = synthetic_rows()
    known = rows[0].a_id
    bouts = [
        UpcomingBoutInput("b1", 1, 8, "Lightweight", True, known, rows[0].b_id),
        UpcomingBoutInput("b2", 6, 8, "Lightweight", False, known, None),
        UpcomingBoutInput("b3", 7, 8, None, False, None, None),
    ]
    predictions, trained_on = predict_bouts(rows, bouts)
    assert trained_on == len(rows)
    assert all(LOW <= p.stars <= HIGH for p in predictions)
    assert [p.basis for p in predictions] == ["both", "one", "none"]
    # a main-event title spot rates above a deep-card spot
    assert predictions[0].stars > predictions[2].stars
    assert predictions[0].reasons and predictions[0].reasons[0].label


def test_the_pipeline_stores_one_prediction_per_bout_and_a_dry_run_stores_none() -> None:
    rows = synthetic_rows()
    bouts = [UpcomingBoutInput("b1", 1, 2, "Lightweight", False, rows[0].a_id, rows[0].b_id)]
    repo = FakeRepository(fight_rows=rows, bout_inputs=bouts)
    report = run_predict_upcoming(repo)
    assert report.bouts == 1 and len(repo.predictions or []) == 1
    dry = FakeRepository(fight_rows=rows, bout_inputs=bouts)
    run_predict_upcoming(dry, dry_run=True)
    assert dry.predictions is None


def test_it_refuses_to_predict_from_too_little_data() -> None:
    bouts = [UpcomingBoutInput("b1", 1, 1, None, False, None, None)]
    repo = FakeRepository(fight_rows=synthetic_rows()[: MIN_TRAINING_FIGHTS - 1], bout_inputs=bouts)
    with pytest.raises(ValueError):
        run_predict_upcoming(repo)


def test_no_bouts_clears_old_predictions() -> None:
    repo = FakeRepository(fight_rows=synthetic_rows())
    run_predict_upcoming(repo)
    assert repo.predictions == []
