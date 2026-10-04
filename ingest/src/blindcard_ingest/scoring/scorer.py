"""Normalise -> composite -> percentile (against a frozen reference) -> stars.

The reference (caps + composite quantiles) is built once per score version from the
historical calibration pool and then frozen into `scoring_versions.reference`. New fights are
scored against that fixed distribution, so existing ratings never drift when events arrive.
"""

from __future__ import annotations

import bisect
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from blindcard_ingest.scoring.config import ScoringConfig
from blindcard_ingest.scoring.features import CAPPED_FEATURES, FEATURE_NAMES

QUANTILE_STEPS = 1000  # reference knots at 0.0%, 0.1%, ..., 100.0%


class ScoringError(RuntimeError):
    """Scoring cannot proceed (e.g. calibration pool too small)."""


@dataclass(frozen=True)
class Reference:
    caps: dict[str, float]
    knots: list[float]  # QUANTILE_STEPS + 1 composite quantiles, ascending
    pool_size: int
    #: Same for the private performance axis; None when the version has no such axis.
    performance_knots: list[float] | None = None

    def to_json(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "caps": dict(self.caps),
            "knots": list(self.knots),
            "pool_size": self.pool_size,
        }
        if self.performance_knots is not None:
            data["performance_knots"] = list(self.performance_knots)
        return data

    @classmethod
    def from_json(cls, data: Mapping[str, Any]) -> Reference:
        knots = _checked_knots(data["knots"])
        performance = data.get("performance_knots")
        return cls(
            caps={str(k): float(v) for k, v in data["caps"].items()},
            knots=knots,
            pool_size=int(data["pool_size"]),
            performance_knots=None if performance is None else _checked_knots(performance),
        )


def _checked_knots(raw: Sequence[Any]) -> list[float]:
    knots = [float(x) for x in raw]
    if len(knots) != QUANTILE_STEPS + 1:
        raise ScoringError(f"reference has {len(knots)} knots, expected {QUANTILE_STEPS + 1}")
    return knots


@dataclass(frozen=True)
class PerformanceScore:
    """The private second axis. Never public: it tracks finishes almost perfectly."""

    composite: float
    percentile: float
    stars: float


@dataclass(frozen=True)
class ScoredFight:
    composite: float
    percentile: float
    stars: float
    raw: dict[str, float]
    normalised: dict[str, float]
    performance: PerformanceScore | None = None

    def features_json(self) -> dict[str, Any]:
        """The private feature payload stored in `excitement_features.features`."""
        payload: dict[str, Any] = {"raw": dict(self.raw), "normalised": dict(self.normalised)}
        if self.performance is not None:
            payload["performance"] = {
                "composite": self.performance.composite,
                "percentile": self.performance.percentile,
                "stars": self.performance.stars,
            }
        return payload


def quantile(sorted_values: Sequence[float], q: float) -> float:
    """Linear-interpolated quantile of an ascending sequence, q in [0, 1]."""
    if not sorted_values:
        raise ScoringError("cannot take a quantile of an empty sequence")
    position = q * (len(sorted_values) - 1)
    lower = int(position)
    upper = min(lower + 1, len(sorted_values) - 1)
    fraction = position - lower
    return sorted_values[lower] + (sorted_values[upper] - sorted_values[lower]) * fraction


def features_of(config: ScoringConfig) -> tuple[str, ...]:
    """The features a version weights (either axis), in the canonical order."""
    return tuple(
        name
        for name in FEATURE_NAMES
        if name in config.weights or name in config.performance_weights
    )


def normalise(
    config: ScoringConfig, caps: Mapping[str, float], raw: Mapping[str, float]
) -> dict[str, float]:
    """Scale the version's features to 0..1: capped ones by their frozen cap, the rest as-is."""
    result: dict[str, float] = {}
    for name in features_of(config):
        value = raw[name]
        if name in CAPPED_FEATURES:
            cap = caps[name]
            result[name] = min(value, cap) / cap if cap > 0 else 0.0
        else:
            result[name] = value
    return result


def composite_of(config: ScoringConfig, normalised: Mapping[str, float]) -> float:
    return _weighted_sum(config.weights, normalised)


def performance_composite_of(config: ScoringConfig, normalised: Mapping[str, float]) -> float:
    return _weighted_sum(config.performance_weights, normalised)


def _weighted_sum(weights: Mapping[str, float], normalised: Mapping[str, float]) -> float:
    # Canonical feature order, so the float sum is reproducible whatever the config's key order.
    return sum(weights[name] * normalised[name] for name in FEATURE_NAMES if name in weights)


def percentile_of(knots: Sequence[float], composite: float) -> float:
    """Percentile (0..100) of `composite` within the reference distribution.

    Ties (flat stretches in the reference) get the mid-rank; values between knots are
    linearly interpolated; values outside the pool clamp to 0 / 100.
    """
    if composite <= knots[0]:
        return 0.0 if composite < knots[0] else _tie_percentile(knots, composite)
    if composite >= knots[-1]:
        return 100.0 if composite > knots[-1] else _tie_percentile(knots, composite)
    lo = bisect.bisect_left(knots, composite)
    hi = bisect.bisect_right(knots, composite)
    if lo != hi:
        return _tie_percentile(knots, composite)
    below, above = knots[lo - 1], knots[lo]
    index = (lo - 1) + (composite - below) / (above - below)
    return index * 100 / QUANTILE_STEPS


def _tie_percentile(knots: Sequence[float], composite: float) -> float:
    lo = bisect.bisect_left(knots, composite)
    hi = bisect.bisect_right(knots, composite)
    return ((lo + hi - 1) / 2) * 100 / QUANTILE_STEPS


def stars_for_percentile(config: ScoringConfig, percentile: float) -> float:
    earned = config.star_thresholds[0].stars
    for threshold in config.star_thresholds:
        if percentile >= threshold.min_percentile:
            earned = threshold.stars
        else:
            break
    return earned


def build_reference(config: ScoringConfig, pool: Sequence[Mapping[str, float]]) -> Reference:
    """Build the frozen reference from the calibration pool's raw features."""
    if len(pool) < config.min_pool_size:
        raise ScoringError(
            f"calibration pool has {len(pool)} fights, need at least {config.min_pool_size}"
        )
    caps = {
        name: quantile(sorted(raw[name] for raw in pool), config.cap_quantile)
        for name in CAPPED_FEATURES
        if name in features_of(config)
    }
    normalised = [normalise(config, caps, raw) for raw in pool]
    performance_knots = None
    if config.performance_weights:
        performance_knots = _knots(performance_composite_of(config, n) for n in normalised)
    return Reference(
        caps=caps,
        knots=_knots(composite_of(config, n) for n in normalised),
        pool_size=len(pool),
        performance_knots=performance_knots,
    )


def _knots(composites: Iterable[float]) -> list[float]:
    ordered = sorted(composites)
    return [quantile(ordered, i / QUANTILE_STEPS) for i in range(QUANTILE_STEPS + 1)]


def score(config: ScoringConfig, reference: Reference, raw: Mapping[str, float]) -> ScoredFight:
    normalised = normalise(config, reference.caps, raw)
    composite = composite_of(config, normalised)
    percentile = round(percentile_of(reference.knots, composite), 2)
    performance = None
    if config.performance_weights:
        if reference.performance_knots is None:
            raise ScoringError("reference lacks the performance axis this config asks for")
        performance_composite = performance_composite_of(config, normalised)
        performance_percentile = round(
            percentile_of(reference.performance_knots, performance_composite), 2
        )
        performance = PerformanceScore(
            composite=performance_composite,
            percentile=performance_percentile,
            stars=stars_for_percentile(config, performance_percentile),
        )
    return ScoredFight(
        composite=composite,
        percentile=percentile,
        stars=stars_for_percentile(config, percentile),
        # Only what this version weights: extra candidate features never leak into its record.
        raw={name: raw[name] for name in features_of(config)},
        normalised=normalised,
        performance=performance,
    )
