"""The recipe behind score v3: one score, fitted to the night bonuses, written as TOML.

The score blends two fits of the same features:
  * Fight of the Night: how worth watching a fight is (two-way action, pace, swings);
  * Performance of the Night: dominant finishes.
A finish is good for a fight, so KO/TKO and submission are ONE feature ("finish") that may add
to a score but never subtract from it. Because credit for finishes makes the stars say
something about how a fight ended, the share of the Performance fit is chosen as the largest
one that keeps AUC(stars -> finished) within a stated margin of neutral on the training years
(default: no more revealing than score v1 was). Duration features are excluded: the length of a
fight is a spoiler.

Everything is deterministic: same labels in, same weights out.
"""

from __future__ import annotations

import statistics
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from blindcard_ingest.fit.dataset import LabeledRow
from blindcard_ingest.fit.stats import (
    auc,
    logistic_fit,
    mean_rank_in_group,
    recall_at_k_per_group,
)
from blindcard_ingest.scoring.config import StarThreshold
from blindcard_ingest.scoring.features import CAPPED_FEATURES
from blindcard_ingest.scoring.scorer import quantile

#: Candidates: no duration features (time_fraction, early_finish, lateness).
SCORE_FEATURES: tuple[str, ...] = (
    "pace",
    "knockdowns",
    "sub_attempts",
    "reversals",
    "swings",
    "competitiveness",
    "close_decision",
    "finish",
    "control_share_nofinish",
    "knockdowns_both",
    "min_pace",
    "takedown_rate",
)

#: Share of the Performance fit blended into the score, tried in this order.
BLEND_GRID: tuple[float, ...] = tuple(i / 40 for i in range(25))

#: A finish is good for a fight, so it may add to a score but never subtract from it.
NON_NEGATIVE_FEATURES: frozenset[str] = frozenset({"finish"})

NEUTRAL_LEAK = 0.5  # AUC(stars -> finished) of a score that says nothing about finishes
#: How far above neutral AUC(stars -> finished) may rise on the training years. 0.25 keeps the
#: score below what score v1 gave away (0.77); 0 would mean no credit for finishes at all.
DEFAULT_FINISH_LEAK = 0.25
#: Slack between the training years and the refit on all years before the report warns.
LEAK_SLACK = 0.05

FEATURE_NOTES: dict[str, str] = {
    "pace": "combined significant strikes landed per minute",
    "knockdowns": "total knockdowns",
    "sub_attempts": "total submission attempts",
    "reversals": "total reversals",
    "swings": "round-to-round lead changes",
    "competitiveness": "1 - |A - B| / (A + B) on significant strikes landed",
    "close_decision": "split or majority decision",
    "finish": "ended by KO/TKO or submission (adds, never subtracts)",
    "control_share_nofinish": "share of the fight under control, when it did not end in a finish",
    "knockdowns_both": "both fighters scored a knockdown",
    "min_pace": "significant strikes per minute of the less active fighter",
    "takedown_rate": "takedowns landed per minute, both fighters",
}


@dataclass(frozen=True)
class Metrics:
    """How a score ranks the held-out fights. Aggregates only."""

    fotn_auc: float
    potn_auc: float
    fotn_recall_at_1: float
    fotn_recall_at_3: float
    fotn_mean_rank: float
    any_bonus_recall_at_3: float
    #: AUC(score -> fight was finished). 0.5 = the score says nothing about finishes.
    finish_auc: float
    #: AUC(score -> fight was finished in round 1).
    round_one_finish_auc: float


@dataclass(frozen=True)
class FitResult:
    weights: dict[str, float]
    #: Share of the Performance fit in the score.
    blend: float
    #: The leak margin the blend was chosen under (see DEFAULT_FINISH_LEAK).
    finish_leak: float
    train_fights: int
    test_fights: int
    test_from_year: int
    l2: float
    #: Held-out metrics keyed "v1" (only when a baseline was given) and "score".
    metrics: dict[str, Metrics]
    #: AUC(shipped weights -> finished) over all labelled fights (the weights are refitted on
    #: all years, so the held-out numbers describe a slightly different model).
    shipped_finish_auc: float


def feature_caps(pool: Sequence[Mapping[str, float]], cap_quantile: float) -> dict[str, float]:
    """The same caps `rescore` will freeze: quantiles of the full scorable pool."""
    wanted = set(SCORE_FEATURES)
    return {
        name: quantile(sorted(raw[name] for raw in pool), cap_quantile)
        for name in CAPPED_FEATURES
        if name in wanted
    }


def _normalised(row: LabeledRow, caps: Mapping[str, float]) -> dict[str, float]:
    result: dict[str, float] = {}
    for name in SCORE_FEATURES:
        value = row.raw[name]
        if name in caps:
            result[name] = min(value, caps[name]) / caps[name] if caps[name] > 0 else 0.0
        else:
            result[name] = value
    return result


def _linear(
    rows: Sequence[dict[str, float]], labels: Sequence[int], features: Sequence[str], l2: float
) -> dict[str, float]:
    """Ridge-logistic weights. A feature that may not be negative and comes out negative is
    dropped (weight 0) and the rest refitted, until none violates its sign."""
    active = list(features)
    while True:
        matrix = [[row[f] for f in active] for row in rows]
        fit = logistic_fit(matrix, labels, l2=l2)
        weights = dict(zip(active, fit.coefficients, strict=True))
        violators = [f for f in active if f in NON_NEGATIVE_FEATURES and weights[f] < 0]
        if not violators:
            return {f: weights.get(f, 0.0) for f in features}
        active = [f for f in active if f not in violators]


def _predict(weights: Mapping[str, float], row: Mapping[str, float]) -> float:
    return sum(weight * row[name] for name, weight in weights.items())


def _scaled(weights: Mapping[str, float]) -> dict[str, float]:
    """Largest weight magnitude 1.0, rounded to 3 decimals, zero weights dropped.

    The score is a percentile of the composite, so the scale does not matter; this only makes
    the file readable. The rounded numbers are what get evaluated and shipped.
    """
    top = max(abs(w) for w in weights.values())
    rounded = {name: round(w / top, 3) for name, w in weights.items()}
    return {name: w for name, w in rounded.items() if w != 0.0}


@dataclass(frozen=True)
class _Fit:
    weights: dict[str, float]
    blend: float


def _fit_blend(
    rows: Sequence[LabeledRow],
    normalised: Sequence[dict[str, float]],
    *,
    l2: float,
    blend: float | None,
    finish_leak: float = DEFAULT_FINISH_LEAK,
) -> _Fit:
    """Fit the score on these rows.

    `blend=None` picks the largest share of the Performance fit (the most credit for finishes)
    while AUC(stars -> finished) stays within `finish_leak` of neutral.
    """
    fotn = [int(r.fotn) for r in rows]
    potn = [int(r.potn) for r in rows]
    fight = _linear(normalised, fotn, SCORE_FEATURES, l2)
    side = _linear(normalised, potn, SCORE_FEATURES, l2)
    spread_fight = statistics.pstdev([_predict(fight, n) for n in normalised]) or 1.0
    spread_side = statistics.pstdev([_predict(side, n) for n in normalised]) or 1.0

    def blended(share: float) -> dict[str, float]:
        return {
            name: (1 - share) * fight[name] / spread_fight + share * side[name] / spread_side
            for name in SCORE_FEATURES
        }

    if blend is None:
        finished = [int(r.finished) for r in rows]

        def leaks_too_much(share: float) -> bool:
            weights = _scaled(blended(share))
            leak = auc([_predict(weights, n) for n in normalised], finished)
            return (NEUTRAL_LEAK if leak is None else leak) > NEUTRAL_LEAK + finish_leak

        allowed = [share for share in BLEND_GRID if not leaks_too_much(share)]
        blend = max(allowed) if allowed else BLEND_GRID[0]
    return _Fit(weights=_scaled(blended(blend)), blend=blend)


def evaluate(rows: Sequence[LabeledRow], scores: Sequence[float]) -> Metrics:
    """Rank `rows` by `scores` against the labels: pooled AUC, per-card recall, finish leakage."""
    cards = [r.event_source_id for r in rows]
    fotn = [int(r.fotn) for r in rows]
    potn = [int(r.potn) for r in rows]
    anything = [int(r.fotn or r.potn) for r in rows]
    finished = [int(r.finished) for r in rows]
    round_one = [int(r.finished and r.end_round == 1) for r in rows]
    return Metrics(
        fotn_auc=_required(auc(scores, fotn)),
        potn_auc=_required(auc(scores, potn)),
        fotn_recall_at_1=_required(recall_at_k_per_group(scores, fotn, cards, k=1)),
        fotn_recall_at_3=_required(recall_at_k_per_group(scores, fotn, cards, k=3)),
        fotn_mean_rank=_required(mean_rank_in_group(scores, fotn, cards)),
        any_bonus_recall_at_3=_required(recall_at_k_per_group(scores, anything, cards, k=3)),
        finish_auc=_required(auc(scores, finished)),
        round_one_finish_auc=_required(auc(scores, round_one)),
    )


def _required(value: float | None) -> float:
    if value is None:
        raise ValueError("the held-out fights lack one of the label classes")
    return value


def fit_scoring(
    rows: Sequence[LabeledRow],
    pool: Sequence[Mapping[str, float]],
    *,
    cap_quantile: float,
    test_from_year: int = 2024,
    l2: float = 5.0,
    finish_leak: float = DEFAULT_FINISH_LEAK,
    baseline: Mapping[str, float] | None = None,
) -> FitResult:
    """Fit on the years before `test_from_year`, judge on the rest, ship weights fit on all years.

    `pool` is every scorable fight's raw features (what `rescore` builds the caps from).
    `baseline` maps fight id -> composite of the score being replaced, for the comparison.
    """
    caps = feature_caps(pool, cap_quantile)
    normalised = [_normalised(r, caps) for r in rows]
    train = [i for i, r in enumerate(rows) if r.year < test_from_year]
    test = [i for i, r in enumerate(rows) if r.year >= test_from_year]
    if not train or not test:
        raise ValueError(f"no fights on both sides of the {test_from_year} split")

    held_out = _fit_blend(
        [rows[i] for i in train],
        [normalised[i] for i in train],
        l2=l2,
        blend=None,
        finish_leak=finish_leak,
    )
    test_rows = [rows[i] for i in test]
    test_norm = [normalised[i] for i in test]
    metrics = {"score": evaluate(test_rows, [_predict(held_out.weights, n) for n in test_norm])}
    if baseline is not None:
        metrics = {"v1": evaluate(test_rows, [baseline[r.fight_id] for r in test_rows]), **metrics}

    final = _fit_blend(rows, normalised, l2=l2, blend=held_out.blend)
    return FitResult(
        weights=final.weights,
        blend=held_out.blend,
        finish_leak=finish_leak,
        train_fights=len(train),
        test_fights=len(test),
        test_from_year=test_from_year,
        l2=l2,
        metrics=metrics,
        shipped_finish_auc=_required(
            auc(
                [_predict(final.weights, n) for n in normalised],
                [int(r.finished) for r in rows],
            )
        ),
    )


def format_report(result: FitResult) -> str:
    """Aggregate numbers only (no fight, fighter or event is named)."""
    lines = [
        f"fit on {result.train_fights} fights before {result.test_from_year}, "
        f"judged on {result.test_fights} fights from {result.test_from_year} on "
        f"(l2={result.l2}, finish credit blend={result.blend:.3f}, "
        f"leak margin {result.finish_leak})",
        f"{'':8}{'FOTN-AUC':>9}{'POTN-AUC':>9}{'FOTN@1':>8}{'FOTN@3':>8}{'rank':>6}"
        f"{'any@3':>7}{'->fin':>7}{'->R1':>6}",
    ]
    for name, m in result.metrics.items():
        lines.append(
            f"{name:8}{m.fotn_auc:9.3f}{m.potn_auc:9.3f}{m.fotn_recall_at_1:8.3f}"
            f"{m.fotn_recall_at_3:8.3f}{m.fotn_mean_rank:6.2f}{m.any_bonus_recall_at_3:7.3f}"
            f"{m.finish_auc:7.3f}{m.round_one_finish_auc:6.3f}"
        )
    lines.append(f"shipped weights, all labelled fights: ->fin {result.shipped_finish_auc:.3f}")
    lines.extend(f"WARNING: {problem}" for problem in leak_problems(result))
    lines.append("FOTN@k: share of Fight of the Night picks in the top k of their own card.")
    lines.append("->fin / ->R1: AUC of the score for 'was finished' / 'finished in round 1';")
    lines.append("  0.5 means the stars say nothing about it, 1.0 would give every finish away.")
    return "\n".join(lines)


def leak_problems(result: FitResult) -> list[str]:
    """Reasons to doubt that the shipped score stays within its leak margin. Empty = fine."""
    problems: list[str] = []
    if result.shipped_finish_auc > NEUTRAL_LEAK + result.finish_leak + LEAK_SLACK:
        problems.append(
            f"shipped weights predict 'finished' more than the margin allows "
            f"(AUC {result.shipped_finish_auc:.3f})"
        )
    if result.blend >= BLEND_GRID[-1]:
        problems.append("the blend share hit the end of its grid; the margin may be too wide")
    return problems


def render_config_toml(
    result: FitResult,
    *,
    version: int,
    cap_quantile: float,
    min_pool_size: int,
    star_thresholds: Sequence[StarThreshold],
) -> str:
    """The scoring config as TOML text, with the held-out numbers as header comments."""

    def weight_lines(weights: Mapping[str, float]) -> list[str]:
        ordered = [f for f in SCORE_FEATURES if f in weights]
        return [f"{name:<24}= {weights[name]:<7} # {FEATURE_NOTES[name]}" for name in ordered]

    score = result.metrics["score"]
    lines = [
        f"# Excitement score v{version}: one score, weights fitted to the Fight / Performance",
        "# of the Night bonuses (regenerate with `blindcard-ingest fit-scoring`; do not edit).",
        f"# Fitted on events before {result.test_from_year}, checked on the rest; shipped weights",
        "# are refitted on all labelled fights. Held-out numbers for this fit:",
        f"#   Fight of the Night AUC {score.fotn_auc:.3f}, in the top 3 of its card "
        f"{score.fotn_recall_at_3:.0%}, Performance of the Night AUC {score.potn_auc:.3f}",
        f"#   AUC of the stars for 'was finished' {score.finish_auc:.3f} (0.5 = no information)",
        f"#   shipped weights, all labelled fights: AUC for 'finished' "
        f"{result.shipped_finish_auc:.3f}",
        f"# The score is {1 - result.blend:.1%} Fight of the Night fit and {result.blend:.1%}",
        "# Performance of the Night fit: the largest share of the second that keeps",
        f"# AUC(stars -> finished) within {result.finish_leak} of neutral on the training years.",
        "# A finish adds to a fight's score and never subtracts from it.",
        "",
        f"version = {version}",
        'description = "Fitted to the Fight/Performance of the Night bonuses: one score."',
        "",
        "[normalisation]",
        f"cap_quantile = {cap_quantile}",
        f"min_pool_size = {min_pool_size}",
        "",
        "# composite = sum(weight * normalised_feature). Negative weights penalise.",
        "[weights]",
        *weight_lines(result.weights),
        "",
        "# Percentile (0-100) -> stars, same curve as v1.",
        "[stars]",
        "thresholds = [",
        *(f"    [{_number(t.min_percentile)}, {t.stars}]," for t in star_thresholds),
        "]",
        "",
    ]
    return "\n".join(lines)


def _number(value: float) -> str:
    return str(int(value)) if value == int(value) else str(value)
