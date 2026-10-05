"""Ridge regression in pure Python: standardised features, an unpenalised intercept."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from blindcard_ingest.fit.stats import solve_linear


@dataclass(frozen=True)
class RidgeModel:
    names: tuple[str, ...]
    means: tuple[float, ...]
    scales: tuple[float, ...]
    weights: tuple[float, ...]
    intercept: float
    #: Standard deviation of the training residuals, for an honest range around a prediction.
    residual_sd: float

    def predict(self, x: Sequence[float]) -> float:
        z = sum(
            w * (v - m) / s
            for w, v, m, s in zip(self.weights, x, self.means, self.scales, strict=True)
        )
        return self.intercept + z


def fit_ridge(
    names: Sequence[str], xs: Sequence[Sequence[float]], ys: Sequence[float], *, l2: float
) -> RidgeModel:
    n, p = len(xs), len(names)
    if n < p + 2:
        raise ValueError("too few examples to fit")
    means = [sum(row[j] for row in xs) / n for j in range(p)]
    scales = []
    for j in range(p):
        variance = sum((row[j] - means[j]) ** 2 for row in xs) / n
        scales.append(math.sqrt(variance) if variance > 1e-12 else 1.0)
    z = [[(row[j] - means[j]) / scales[j] for j in range(p)] for row in xs]
    y_mean = sum(ys) / n
    yc = [y - y_mean for y in ys]
    gram = [[0.0] * p for _ in range(p)]
    rhs = [0.0] * p
    for row, y in zip(z, yc, strict=True):
        for i in range(p):
            rhs[i] += row[i] * y
            for j in range(i, p):
                gram[i][j] += row[i] * row[j]
    for i in range(p):
        for j in range(i):
            gram[i][j] = gram[j][i]
        gram[i][i] += l2
    weights = solve_linear(gram, rhs)
    model = RidgeModel(
        names=tuple(names),
        means=tuple(means),
        scales=tuple(scales),
        weights=tuple(weights),
        intercept=y_mean,
        residual_sd=0.0,
    )
    residuals = [y - model.predict(row) for row, y in zip(xs, ys, strict=True)]
    sd = math.sqrt(sum(r * r for r in residuals) / max(1, n - p - 1))
    return RidgeModel(
        names=model.names,
        means=model.means,
        scales=model.scales,
        weights=model.weights,
        intercept=model.intercept,
        residual_sd=sd,
    )


def subset(model_names: Sequence[str], keep: Sequence[str]) -> list[int]:
    """Indexes of `keep` within `model_names`."""
    return [model_names.index(name) for name in keep]
