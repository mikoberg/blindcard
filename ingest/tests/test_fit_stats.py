import math
import random

import pytest

from blindcard_ingest.fit.stats import (
    auc,
    cohens_d,
    logistic_fit,
    mean_rank_in_group,
    recall_at_k_per_group,
    solve_linear,
)


def test_auc_perfect_inverse_and_ties() -> None:
    assert auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1]) == 1.0
    assert auc([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1]) == 0.0
    assert auc([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1]) == 0.5  # all tied: no information


def test_auc_matches_the_pairwise_definition() -> None:
    rng = random.Random(1)
    scores = [round(rng.random(), 1) for _ in range(60)]  # many ties
    labels = [1 if rng.random() < 0.4 else 0 for _ in scores]
    pos = [s for s, y in zip(scores, labels, strict=True) if y]
    neg = [s for s, y in zip(scores, labels, strict=True) if not y]
    wins = sum((p > n) + 0.5 * (p == n) for p in pos for n in neg)
    assert auc(scores, labels) == pytest.approx(wins / (len(pos) * len(neg)))


def test_auc_needs_both_classes() -> None:
    assert auc([1.0, 2.0], [1, 1]) is None
    assert auc([], []) is None


def test_cohens_d() -> None:
    assert cohens_d([2.0, 4.0], [1.0, 3.0]) == pytest.approx(1 / math.sqrt(2))
    assert cohens_d([1.0, 1.0], [1.0, 1.0]) == 0.0  # no spread, no difference
    assert cohens_d([1.0], [1.0, 2.0]) is None  # a group of one has no spread


def test_solve_linear() -> None:
    a = [[2.0, 1.0, 0.0], [1.0, 3.0, 1.0], [0.0, 1.0, 4.0]]
    x = solve_linear(a, [3.0, 6.0, 9.0])
    assert x == pytest.approx([1.0, 1.0, 2.0])
    with pytest.raises(ValueError, match="singular"):
        solve_linear([[1.0, 2.0], [2.0, 4.0]], [1.0, 2.0])


def test_logistic_fit_recovers_the_direction_of_the_signal() -> None:
    rng = random.Random(7)
    rows, labels = [], []
    for _ in range(2000):
        signal, noise = rng.random(), rng.random()
        rows.append([signal, noise])
        labels.append(1 if rng.random() < 1 / (1 + math.exp(-(6 * signal - 3))) else 0)
    fit = logistic_fit(rows, labels, l2=1.0)
    assert fit.coefficients[0] == pytest.approx(6.0, abs=1.2)
    assert abs(fit.coefficients[1]) < 0.8
    assert fit.intercept == pytest.approx(-3.0, abs=0.8)


def test_logistic_fit_is_deterministic_and_survives_perfect_separation() -> None:
    rows = [[0.0], [0.1], [0.9], [1.0]]
    labels = [0, 0, 1, 1]
    first = logistic_fit(rows, labels, l2=1.0)
    again = logistic_fit(rows, labels, l2=1.0)
    assert first == again
    assert math.isfinite(first.coefficients[0]) and first.coefficients[0] > 0  # L2 keeps it finite


def test_logistic_fit_rejects_bad_input() -> None:
    with pytest.raises(ValueError, match="both classes"):
        logistic_fit([[1.0], [2.0]], [1, 1], l2=1.0)
    with pytest.raises(ValueError, match="same length"):
        logistic_fit([[1.0]], [0, 1], l2=1.0)


def test_group_metrics() -> None:
    groups = ["a"] * 4 + ["b"] * 3 + ["c"] * 3
    scores = [0.9, 0.5, 0.4, 0.1, 0.2, 0.8, 0.3, 0.5, 0.5, 0.5]
    labels = [1, 0, 0, 0, 1, 0, 0, 0, 0, 0]  # group c has no positive: not counted
    assert recall_at_k_per_group(scores, labels, groups, k=1) == pytest.approx(0.5)  # a yes, b no
    assert recall_at_k_per_group(scores, labels, groups, k=2) == pytest.approx(0.5)
    assert recall_at_k_per_group(scores, labels, groups, k=3) == pytest.approx(1.0)
    # rank 1 in a, rank 3 in b (0.2 is the lowest of three)
    assert mean_rank_in_group(scores, labels, groups) == pytest.approx(2.0)
    assert recall_at_k_per_group(scores, [0] * 10, groups, k=1) is None
