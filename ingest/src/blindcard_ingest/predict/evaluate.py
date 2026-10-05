"""Walk-forward evaluation: train on the years before a year, predict that year, move on.

Never a random split: a fight is only ever predicted by a model that has seen nothing from its
own year or later. The candidate must beat a context-only baseline (main event, title, division,
no fighter history) before it is shown on the site.
"""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass, field

from blindcard_ingest.fit.stats import _midranks
from blindcard_ingest.predict.dataset import CONTEXT_FEATURES, FEATURES, Example
from blindcard_ingest.predict.model import RidgeModel, fit_ridge, subset

#: Models compared. "full" is the candidate; the others are baselines.
FIGHTER_ONLY = ("avg_rating",)


def pearson(xs: Sequence[float], ys: Sequence[float]) -> float:
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx == 0 or syy == 0:
        return 0.0
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True)) / math.sqrt(sxx * syy)


def spearman(xs: Sequence[float], ys: Sequence[float]) -> float:
    return pearson(_midranks(list(xs)), _midranks(list(ys)))


@dataclass
class Metrics:
    n: int
    pearson: float
    spearman: float
    mae: float
    rmse: float
    #: Mean predicted and mean actual rating per predicted quintile (lowest to highest).
    calibration: list[tuple[float, float]] = field(default_factory=list)
    #: Share of the actual top 3 of each card that the predicted top 3 contains (random ~ 3/n).
    top3_overlap: float = 0.0
    random_top3_overlap: float = 0.0

    def line(self) -> str:
        return (
            f"n={self.n} pearson={self.pearson:.3f} spearman={self.spearman:.3f} "
            f"mae={self.mae:.3f} rmse={self.rmse:.3f} top3={self.top3_overlap:.3f} "
            f"(random {self.random_top3_overlap:.3f})"
        )


def _event_key(example: Example) -> object:
    return example.row.event_date


def metrics(examples: Sequence[Example], preds: Sequence[float]) -> Metrics:
    ys = [e.y for e in examples]
    errors = [p - y for p, y in zip(preds, ys, strict=True)]
    order = sorted(range(len(preds)), key=preds.__getitem__)
    calibration: list[tuple[float, float]] = []
    for q in range(5):
        chunk = order[q * len(order) // 5 : (q + 1) * len(order) // 5]
        if chunk:
            calibration.append(
                (sum(preds[i] for i in chunk) / len(chunk), sum(ys[i] for i in chunk) / len(chunk))
            )
    by_card: dict[object, list[int]] = defaultdict(list)
    for i, e in enumerate(examples):
        by_card[_event_key(e)].append(i)
    overlap, chance, cards = 0.0, 0.0, 0
    for indexes in by_card.values():
        if len(indexes) < 6:
            continue
        k = 3
        top_pred = set(sorted(indexes, key=lambda i: -preds[i])[:k])
        top_true = set(sorted(indexes, key=lambda i: -ys[i])[:k])
        overlap += len(top_pred & top_true) / k
        chance += k / len(indexes)
        cards += 1
    return Metrics(
        n=len(ys),
        pearson=pearson(preds, ys),
        spearman=spearman(preds, ys),
        mae=sum(abs(e) for e in errors) / len(errors),
        rmse=math.sqrt(sum(e * e for e in errors) / len(errors)),
        calibration=calibration,
        top3_overlap=overlap / cards if cards else 0.0,
        random_top3_overlap=chance / cards if cards else 0.0,
    )


def _fit(
    examples: Sequence[Example], names: Sequence[str], l2: float
) -> tuple[RidgeModel, list[int]]:
    idx = subset(FEATURES, names)
    model = fit_ridge(
        names, [[e.x[i] for i in idx] for e in examples], [e.y for e in examples], l2=l2
    )
    return model, idx


@dataclass
class WalkForward:
    examples: list[Example]
    #: model name -> prediction per test example (same order as `examples`)
    predictions: dict[str, list[float]]
    residual_sd: float


def walk_forward(
    examples: Sequence[Example], *, test_from_year: int, l2: float = 20.0, min_train: int = 500
) -> WalkForward:
    """Yearly rolling origin. Examples must be in date order."""
    years = sorted(
        {e.row.event_date.year for e in examples if e.row.event_date.year >= test_from_year}
    )
    tested: list[Example] = []
    out: dict[str, list[float]] = {"constant": [], "context": [], "fighters": [], "full": []}
    for year in years:
        train = [e for e in examples if e.row.event_date.year < year]
        test = [e for e in examples if e.row.event_date.year == year]
        if len(train) < min_train or not test:
            continue
        mean = sum(e.y for e in train) / len(train)
        context, cidx = _fit(train, CONTEXT_FEATURES, l2)
        fighters, fidx = _fit(train, FIGHTER_ONLY, l2)
        full, _ = _fit(train, FEATURES, l2)
        for e in test:
            out["constant"].append(mean)
            out["context"].append(context.predict([e.x[i] for i in cidx]))
            out["fighters"].append(fighters.predict([e.x[i] for i in fidx]))
            out["full"].append(full.predict(e.x))
        tested.extend(test)
    residuals = [p - e.y for p, e in zip(out["full"], tested, strict=True)]
    sd = math.sqrt(sum(r * r for r in residuals) / len(residuals)) if residuals else 0.0
    return WalkForward(examples=tested, predictions=out, residual_sd=sd)


def report(result: WalkForward) -> str:
    lines = [f"walk-forward over {len(result.examples)} fights"]
    for name in ("constant", "context", "fighters", "full"):
        label = "constant*" if name == "constant" else name
        lines.append(f"{label:9s} {metrics(result.examples, result.predictions[name]).line()}")
    full = metrics(result.examples, result.predictions["full"])
    lines.append("* constant: every fight tied, so its top 3 is simply the top of the card.")
    lines.append("calibration of 'full' by predicted quintile (predicted -> actual):")
    for predicted, actual in full.calibration:
        lines.append(f"  {predicted:.2f} -> {actual:.2f}")
    return "\n".join(lines)
