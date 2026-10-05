"""predict-upcoming: an expected rating for every announced bout, from public data only.

Retrains on every run (a few thousand rows, instant) so the prediction always rests on the
latest ratings, and stores only the output: a number, how much history it rests on and the
plain-language reasons. A prediction exists only for a bout that has not been fought; the
upcoming rows are deleted after the event, so a prediction is never shown next to the real rating.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from blindcard_ingest.db.repository import Repository
from blindcard_ingest.predict.dataset import FEATURES, FightRow, Tracker, build_examples
from blindcard_ingest.predict.model import RidgeModel, fit_ridge
from blindcard_ingest.predict.types import (
    MODEL_VERSION,
    Reason,
    UpcomingBoutInput,
    UpcomingPrediction,
)

logger = logging.getLogger(__name__)

L2 = 20.0
MIN_TRAINING_FIGHTS = 500
#: A fighter with at least this many rated fights is "known" for the basis of a prediction.
KNOWN_FIGHTS = 3
#: Predictions stay inside the rating scale (a 5.0 is reserved for classics, 1.0 for the worst).
LOW, HIGH = 1.0, 4.8


@dataclass
class PredictionReport:
    trained_on: int = 0
    bouts: int = 0
    predictions: list[UpcomingPrediction] = field(default_factory=list)


_GROUPS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "Earlier fights of both fighters",
        (
            "avg_rating",
            "best_rating",
            "worst_rating",
            "recent_rating",
            "pair_synergy",
            "avg_effect",
            "best_effect",
            "worst_effect",
            "experience",
        ),
    ),
    ("Spot on the card", ("main_event", "co_main", "title_fight", "card_depth", "depth_x_rating")),
    ("The division", ("womens", "division_level")),
    ("They have met before", ("met_before",)),
)


def explain(model: RidgeModel, x: tuple[float, ...]) -> tuple[Reason, ...]:
    """What moved the expected rating, grouped, largest first (against an average fight)."""
    parts = {
        name: w * (v - m) / s
        for name, w, v, m, s in zip(
            model.names, model.weights, x, model.means, model.scales, strict=True
        )
    }
    reasons = [Reason(label, sum(parts[n] for n in names)) for label, names in _GROUPS]
    return tuple(
        sorted((r for r in reasons if abs(r.amount) >= 0.05), key=lambda r: -abs(r.amount))
    )


def _basis(tracker: Tracker, a_id: str | None, b_id: str | None) -> str:
    known = sum(
        1 for f in (a_id, b_id) if f and len(tracker.stars_by_fighter.get(f, [])) >= KNOWN_FIGHTS
    )
    return {2: "both", 1: "one"}.get(known, "none")


def predict_bouts(
    rows: list[FightRow], bouts: list[UpcomingBoutInput]
) -> tuple[list[UpcomingPrediction], int]:
    examples, tracker = build_examples(rows)
    if len(examples) < MIN_TRAINING_FIGHTS:
        raise ValueError(f"only {len(examples)} rated fights to learn from")
    model = fit_ridge(FEATURES, [e.x for e in examples], [e.y for e in examples], l2=L2)
    out: list[UpcomingPrediction] = []
    for bout in bouts:
        x = tracker.features(
            bout.a_id,
            bout.b_id,
            bout.weight_class,
            bout.position,
            bout.is_title_fight,
            bout.card_size,
        )
        stars = min(HIGH, max(LOW, model.predict(x)))
        out.append(
            UpcomingPrediction(
                bout_id=bout.bout_id,
                stars=round(stars, 2),
                basis=_basis(tracker, bout.a_id, bout.b_id),
                reasons=explain(model, x),
            )
        )
    return out, len(examples)


def run_predict_upcoming(repo: Repository, *, dry_run: bool = False) -> PredictionReport:
    bouts = repo.upcoming_bouts_for_prediction()
    report = PredictionReport(bouts=len(bouts))
    if not bouts:
        logger.info("predict-upcoming: no announced bouts")
        if not dry_run:
            repo.set_upcoming_predictions([])
        return report
    predictions, trained_on = predict_bouts(repo.prediction_fights(), bouts)
    report.trained_on = trained_on
    report.predictions = predictions
    logger.info(
        "predict-upcoming%s: %d bouts predicted from %d rated fights (model v%d)",
        " (dry run)" if dry_run else "",
        len(predictions),
        trained_on,
        MODEL_VERSION,
    )
    if not dry_run:
        repo.set_upcoming_predictions(predictions)
    return report
