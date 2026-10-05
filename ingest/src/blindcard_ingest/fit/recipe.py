"""The recipe behind score v10: one score, fitted to the night bonuses, written as TOML.

The score blends two fits of the same features:
  * Fight of the Night: how worth watching a fight is (two-way action, pace, swings);
  * Performance of the Night: dominant finishes.
What a fan finds worth watching includes a finish (KO/TKO and submission are ONE feature,
"finish"), how early it came, how much happened over the whole fight (volume, a five-round
war), how big the fight was (main event, co-main, title fight) and what was known about the
fighters beforehand (rematch, win streaks, an unbeaten fighter, earlier headliners). None of
those may subtract from a score. The share of the Performance fit is the largest one
that keeps AUC(stars -> finished) within a margin of neutral on the training years: a wider
margin gives finishes more credit. The stakes are known before the fight and cost nothing.

Everything is deterministic: same labels in, same weights out.
"""

from __future__ import annotations

import dataclasses
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
from blindcard_ingest.scoring.scorer import apply_era, era_scales, quantile

#: Candidates. time_fraction and finish lateness are left out: early_finish says the same.
#: close_decision is left out too: how the judges split says how the fight ended, and a close,
#: competitive fight is not worth less (or more) for it.
SCORE_FEATURES: tuple[str, ...] = (
    "pace",
    "knockdowns",
    "sub_attempts",
    "reversals",
    "swings",
    "competitiveness",
    "real_finish",
    "control_share_nofinish",
    "knockdowns_both",
    "min_pace",
    "takedown_rate",
    "real_early_finish",
    "main_event",
    "co_main",
    "title_fight",
    "volume",
    "five_rounds",
    "rematch",
    "streak",
    "star_power",
    "unbeaten_fighter",
    "experience",
    "cut_short",
    "fragile_ko",
)

#: Editorial weights, set by hand instead of fitted (relative to the largest fitted weight, 1.0).
#: The bonus labels cannot teach these: a fight that was stopped by an injury hardly ever earns
#: a bonus but there are too few of them to show it, and the labels reward a KO of a fighter
#: who is often stopped as much as any other. They say what a fan means by "worth watching".
FIXED_WEIGHTS: dict[str, float] = {
    # A fight stopped early by an injury (or "could not continue") did not get to happen.
    "cut_short": -0.6,
    # Stopping a fighter who is rarely stopped is worth more than stopping one who often is:
    # only a KO-loss history clearly above the usual counts.
    "fragile_ko": -0.5,
}

#: Compared with fights of their own era: strikes per minute grew over the years, so a typical
#: fight of 2013 would otherwise look dull next to one of 2022.
ERA_FEATURES: tuple[str, ...] = ("pace", "min_pace", "volume")

#: Share of the Performance fit blended into the score, tried in this order.
BLEND_GRID: tuple[float, ...] = tuple(i / 40 for i in range(25))

#: Where the bout sat on the card. Only a nudge: a main event is not good because it is a main
#: event, so these weights are capped at this share of the largest weight (after scaling).
STAKES_FEATURES: tuple[str, ...] = ("main_event", "co_main", "title_fight")
DEFAULT_STAKES_CAP = 0.20
#: What was known about the fighters beforehand: a story the numbers of the bout cannot show.
#: The labels (bonuses) hardly say anything about it, so these are capped too, a bit higher.
CAREER_FEATURES: tuple[str, ...] = (
    "rematch",
    "streak",
    "star_power",
    "unbeaten_fighter",
    "experience",
)
DEFAULT_CAREER_CAP = 0.35

#: Good for a fight by definition: they may add to a score but never subtract from it.
NON_NEGATIVE_FEATURES: frozenset[str] = frozenset(
    {
        "real_finish",
        "real_early_finish",
        "main_event",
        "co_main",
        "title_fight",
        "volume",
        "five_rounds",
        *CAREER_FEATURES,
    }
)

NEUTRAL_LEAK = 0.5  # AUC(stars -> finished) of a score that says nothing about finishes
#: How far above neutral AUC(stars -> finished) may rise on the training years. Wider = finishes
#: count for more. 0.4 (v8-v10) let finishes dominate: 55% of finishes but only 10% of decisions
#: reached 4 stars, and the held-out Fight of the Night AUC was lower. 0.2 keeps a finish a clear
#: plus (the stars still tell finishes apart a little) without making it the whole score.
DEFAULT_FINISH_LEAK = 0.20
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
    "real_finish": "ended by KO/TKO or submission, not by an injury (adds, never subtracts)",
    "control_share_nofinish": "share of the fight under control, when it did not end in a finish",
    "knockdowns_both": "both fighters scored a knockdown",
    "min_pace": "significant strikes per minute of the less active fighter",
    "takedown_rate": "takedowns landed per minute, both fighters",
    "real_early_finish": "how early a real finish came (1 - share of the scheduled time used)",
    "main_event": "the main event of the card",
    "co_main": "the co-main event",
    "title_fight": "a championship bout",
    "volume": "significant strikes landed over the whole fight, both fighters",
    "five_rounds": "scheduled for five rounds",
    "rematch": "the two fighters have met before",
    "streak": "the two fighters' current win streaks, added",
    "star_power": "their earlier main events and title fights, added",
    "unbeaten_fighter": "at least one of them has no UFC loss",
    "experience": "UFC fights of the less experienced of the two",
    "cut_short": "share of the scheduled time not fought, if an injury or CNC ended it",
    "fragile_ko": "KO/TKO, times how far the more fragile fighter's KO losses exceed the usual",
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


def _scaled(
    weights: Mapping[str, float], stakes_cap: float, career_cap: float = DEFAULT_CAREER_CAP
) -> dict[str, float]:
    """Largest weight magnitude 1.0, stakes capped, rounded to 3 decimals, zeros dropped.

    The score is a percentile of the composite, so the scale does not matter; this only makes
    the file readable. The rounded numbers are what get evaluated and shipped.
    """
    top = max(abs(w) for w in weights.values())
    rounded = {name: round(w / top, 3) for name, w in weights.items()}
    for name in STAKES_FEATURES:
        if name in rounded:
            rounded[name] = min(rounded[name], stakes_cap)
    for name in CAREER_FEATURES:
        if name in rounded:
            rounded[name] = min(rounded[name], career_cap)
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
    stakes_cap: float = DEFAULT_STAKES_CAP,
) -> _Fit:
    """Fit the score on these rows.

    `blend=None` picks the largest share of the Performance fit (the most credit for finishes)
    while AUC(stars -> finished) stays within `finish_leak` of neutral.
    """
    fotn = [int(r.fotn) for r in rows]
    potn = [int(r.potn) for r in rows]
    fitted = tuple(f for f in SCORE_FEATURES if f not in FIXED_WEIGHTS)
    fight = _linear(normalised, fotn, fitted, l2)
    side = _linear(normalised, potn, fitted, l2)
    spread_fight = statistics.pstdev([_predict(fight, n) for n in normalised]) or 1.0
    spread_side = statistics.pstdev([_predict(side, n) for n in normalised]) or 1.0

    def blended(share: float) -> dict[str, float]:
        return {
            name: (1 - share) * fight[name] / spread_fight + share * side[name] / spread_side
            for name in fitted
        }

    def shipped(share: float) -> dict[str, float]:
        return {**_scaled(blended(share), stakes_cap), **FIXED_WEIGHTS}

    if blend is None:
        finished = [int(r.finished) for r in rows]

        def leaks_too_much(share: float) -> bool:
            weights = shipped(share)
            leak = auc([_predict(weights, n) for n in normalised], finished)
            return (NEUTRAL_LEAK if leak is None else leak) > NEUTRAL_LEAK + finish_leak

        allowed = [share for share in BLEND_GRID if not leaks_too_much(share)]
        blend = max(allowed) if allowed else BLEND_GRID[0]
    return _Fit(weights=shipped(blend), blend=blend)


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
    stakes_cap: float = DEFAULT_STAKES_CAP,
    baseline: Mapping[str, float] | None = None,
) -> FitResult:
    """Fit on the years before `test_from_year`, judge on the rest, ship weights fit on all years.

    `pool` is every scorable fight's raw features (what `rescore` builds the caps from).
    `baseline` maps fight id -> composite of the score being replaced, for the comparison.
    """
    scales = era_scales(pool)
    pool = [apply_era(ERA_FEATURES, scales, raw) for raw in pool]
    rows = [dataclasses.replace(r, raw=dict(apply_era(ERA_FEATURES, scales, r.raw))) for r in rows]
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
        stakes_cap=stakes_cap,
    )
    test_rows = [rows[i] for i in test]
    test_norm = [normalised[i] for i in test]
    metrics = {"score": evaluate(test_rows, [_predict(held_out.weights, n) for n in test_norm])}
    if baseline is not None:
        metrics = {"v1": evaluate(test_rows, [baseline[r.fight_id] for r in test_rows]), **metrics}

    final = _fit_blend(rows, normalised, l2=l2, blend=held_out.blend, stakes_cap=stakes_cap)
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
        f"# Set by hand, not fitted: {', '.join(f'{n} {w}' for n, w in FIXED_WEIGHTS.items())}.",
        "",
        f"version = {version}",
        'description = "Fitted to the Fight/Performance of the Night bonuses: one score."',
        "",
        "[normalisation]",
        f"cap_quantile = {cap_quantile}",
        f"min_pool_size = {min_pool_size}",
        "# Compared with fights of their own era (strikes per minute grew over the years):",
        "era_adjusted = [" + ", ".join(f'"{name}"' for name in ERA_FEATURES) + "]",
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
