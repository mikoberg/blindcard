"""Small statistics toolkit for score fitting: pure Python, deterministic, no dependencies."""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Hashable, Sequence
from dataclasses import dataclass


def _midranks(values: Sequence[float]) -> list[float]:
    """1-based ranks, tied values sharing their average rank."""
    order = sorted(range(len(values)), key=values.__getitem__)
    ranks = [0.0] * len(values)
    start = 0
    while start < len(order):
        end = start
        while end + 1 < len(order) and values[order[end + 1]] == values[order[start]]:
            end += 1
        shared = (start + end) / 2 + 1
        for index in order[start : end + 1]:
            ranks[index] = shared
        start = end + 1
    return ranks


def auc(scores: Sequence[float], labels: Sequence[int]) -> float | None:
    """P(a random positive scores above a random negative), ties counting half.

    None when a class is missing. Equals the Mann-Whitney U statistic over n_pos * n_neg.
    """
    positives = sum(1 for y in labels if y)
    negatives = len(labels) - positives
    if positives == 0 or negatives == 0:
        return None
    ranks = _midranks(scores)
    rank_sum = sum(r for r, y in zip(ranks, labels, strict=True) if y)
    return (rank_sum - positives * (positives + 1) / 2) / (positives * negatives)


def _mean(values: Sequence[float]) -> float:
    return sum(values) / len(values)


def _variance(values: Sequence[float]) -> float:
    centre = _mean(values)
    return sum((v - centre) ** 2 for v in values) / (len(values) - 1)


def cohens_d(positive: Sequence[float], negative: Sequence[float]) -> float | None:
    """Standardised mean difference (pooled SD). None if a group has fewer than two values."""
    if len(positive) < 2 or len(negative) < 2:
        return None
    pooled = (
        (len(positive) - 1) * _variance(positive) + (len(negative) - 1) * _variance(negative)
    ) / (len(positive) + len(negative) - 2)
    if pooled == 0:
        return 0.0
    return (_mean(positive) - _mean(negative)) / math.sqrt(pooled)


def solve_linear(matrix: Sequence[Sequence[float]], rhs: Sequence[float]) -> list[float]:
    """Solve A x = b by Gaussian elimination with partial pivoting."""
    n = len(rhs)
    a = [list(row) + [rhs[i]] for i, row in enumerate(matrix)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(a[r][col]))
        if abs(a[pivot][col]) < 1e-12:
            raise ValueError("matrix is singular")
        a[col], a[pivot] = a[pivot], a[col]
        for row in range(col + 1, n):
            factor = a[row][col] / a[col][col]
            for k in range(col, n + 1):
                a[row][k] -= factor * a[col][k]
    x = [0.0] * n
    for row in range(n - 1, -1, -1):
        x[row] = (a[row][n] - sum(a[row][k] * x[k] for k in range(row + 1, n))) / a[row][row]
    return x


@dataclass(frozen=True)
class LogisticFit:
    intercept: float
    coefficients: tuple[float, ...]


def _sigmoid(z: float) -> float:
    if z >= 0:
        return 1 / (1 + math.exp(-z))
    e = math.exp(z)
    return e / (1 + e)


def logistic_fit(
    rows: Sequence[Sequence[float]],
    labels: Sequence[int],
    *,
    l2: float,
    max_iter: int = 100,
    tolerance: float = 1e-9,
) -> LogisticFit:
    """L2-regularised logistic regression by Newton / IRLS. The intercept is not penalised.

    The penalty keeps the solution finite under perfect separation and makes the system
    solvable when features are collinear.
    """
    if len(rows) != len(labels):
        raise ValueError("rows and labels must have the same length")
    if not any(labels) or all(labels):
        raise ValueError("labels must contain both classes")
    width = len(rows[0])
    beta = [0.0] * (width + 1)  # beta[0] is the intercept
    design = [[1.0, *row] for row in rows]
    penalty = [0.0] + [l2] * width
    for _ in range(max_iter):
        gradient = [-penalty[j] * beta[j] for j in range(width + 1)]
        hessian = [[0.0] * (width + 1) for _ in range(width + 1)]
        for x, y in zip(design, labels, strict=True):
            p = _sigmoid(sum(b * v for b, v in zip(beta, x, strict=True)))
            weight = p * (1 - p)
            for j in range(width + 1):
                gradient[j] += (y - p) * x[j]
                if x[j] == 0.0:
                    continue
                for k in range(j, width + 1):
                    hessian[j][k] += weight * x[j] * x[k]
        for j in range(width + 1):
            hessian[j][j] += penalty[j]
            for k in range(j):
                hessian[j][k] = hessian[k][j]
        step = solve_linear(hessian, gradient)
        beta = [b + s for b, s in zip(beta, step, strict=True)]
        if max(abs(s) for s in step) < tolerance:
            break
    return LogisticFit(intercept=beta[0], coefficients=tuple(beta[1:]))


def _positive_ranks(
    scores: Sequence[float], labels: Sequence[int], groups: Sequence[Hashable]
) -> list[float]:
    """Rank (1 = best, ties share the average) of every positive within its own group."""
    members: dict[Hashable, list[int]] = defaultdict(list)
    for index, group in enumerate(groups):
        members[group].append(index)
    ranks: list[float] = []
    for indices in members.values():
        for i in indices:
            if not labels[i]:
                continue
            higher = sum(1 for j in indices if scores[j] > scores[i])
            tied = sum(1 for j in indices if scores[j] == scores[i] and j != i)
            ranks.append(1 + higher + tied / 2)
    return ranks


def recall_at_k_per_group(
    scores: Sequence[float], labels: Sequence[int], groups: Sequence[Hashable], *, k: int
) -> float | None:
    """Share of positives ranked in the top k of their own group (e.g. their own card)."""
    ranks = _positive_ranks(scores, labels, groups)
    if not ranks:
        return None
    return sum(1 for r in ranks if r <= k) / len(ranks)


def mean_rank_in_group(
    scores: Sequence[float], labels: Sequence[int], groups: Sequence[Hashable]
) -> float | None:
    """Average within-group rank of the positives (1 = always the top fight of its card)."""
    ranks = _positive_ranks(scores, labels, groups)
    return _mean(ranks) if ranks else None
