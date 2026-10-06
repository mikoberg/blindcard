"""Scoring configuration, loaded from `config/scoring_vN.toml` (stdlib tomllib) and validated."""

from __future__ import annotations

import math
import tomllib
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from blindcard_ingest.scoring.features import FEATURE_NAMES


class ScoringConfigError(ValueError):
    """The scoring config is missing or invalid."""


@dataclass(frozen=True)
class StarThreshold:
    min_percentile: float
    stars: float


@dataclass(frozen=True)
class ScoringConfig:
    version: int
    description: str
    cap_quantile: float
    min_pool_size: int
    weights: dict[str, float]
    star_thresholds: tuple[StarThreshold, ...]
    #: Optional second axis, scored privately and shown only after a reveal. Empty = none.
    performance_weights: dict[str, float] = field(default_factory=dict)
    #: Features compared with fights of their own era (pace-like ones: strike counts per minute
    #: grew over the years). Empty = no adjustment.
    era_adjusted: tuple[str, ...] = ()
    #: A fight shorter than this many seconds cannot reach the top star level (a "classic" needs
    #: some fight in it). 0 = no such rule.
    classic_min_seconds: float = 0.0
    #: A real knockout (KO/TKO, not stopped by an injury) is never rated below this many stars: the
    #: entertainment of a knockout is worth that much whatever else the fight held. 0 = no rule.
    knockout_min_stars: float = 0.0
    #: The same for a real submission finish (a finish that is not a knockout and not an injury).
    submission_min_stars: float = 0.0

    def to_json(self) -> dict[str, Any]:
        """JSON snapshot stored in `scoring_versions.config` for reproducibility."""
        snapshot: dict[str, Any] = {
            "version": self.version,
            "description": self.description,
            "cap_quantile": self.cap_quantile,
            "min_pool_size": self.min_pool_size,
            "weights": dict(self.weights),
            "star_thresholds": [[t.min_percentile, t.stars] for t in self.star_thresholds],
        }
        if self.performance_weights:
            snapshot["performance_weights"] = dict(self.performance_weights)
        if self.era_adjusted:
            snapshot["era_adjusted"] = list(self.era_adjusted)
        if self.classic_min_seconds:
            snapshot["classic_min_seconds"] = self.classic_min_seconds
        if self.knockout_min_stars:
            snapshot["knockout_min_stars"] = self.knockout_min_stars
        if self.submission_min_stars:
            snapshot["submission_min_stars"] = self.submission_min_stars
        return snapshot

    @classmethod
    def from_json(cls, data: Mapping[str, Any]) -> ScoringConfig:
        """Rebuild a config from a `to_json` snapshot (as stored in `scoring_versions`)."""
        return cls(
            version=int(data["version"]),
            description=str(data.get("description", "")),
            cap_quantile=float(data["cap_quantile"]),
            min_pool_size=int(data["min_pool_size"]),
            weights={str(k): float(v) for k, v in data["weights"].items()},
            star_thresholds=tuple(
                StarThreshold(float(p), float(s)) for p, s in data["star_thresholds"]
            ),
            performance_weights={
                str(k): float(v) for k, v in data.get("performance_weights", {}).items()
            },
            era_adjusted=tuple(str(name) for name in data.get("era_adjusted", ())),
            classic_min_seconds=float(data.get("classic_min_seconds", 0.0)),
            knockout_min_stars=float(data.get("knockout_min_stars", 0.0)),
            submission_min_stars=float(data.get("submission_min_stars", 0.0)),
        )


def parse_scoring_config(data: Mapping[str, Any]) -> ScoringConfig:
    try:
        version = data["version"]
        normalisation = data["normalisation"]
        raw_weights = data["weights"]
        raw_thresholds = data["stars"]["thresholds"]
    except KeyError as exc:
        raise ScoringConfigError(f"missing key in scoring config: {exc}") from exc

    if not isinstance(version, int) or isinstance(version, bool) or version < 1:
        raise ScoringConfigError("version must be an integer >= 1")

    cap_quantile = normalisation.get("cap_quantile")
    if not isinstance(cap_quantile, int | float) or not 0 < cap_quantile <= 1:
        raise ScoringConfigError("normalisation.cap_quantile must be in (0, 1]")
    min_pool_size = normalisation.get("min_pool_size")
    if not isinstance(min_pool_size, int) or min_pool_size < 1:
        raise ScoringConfigError("normalisation.min_pool_size must be an integer >= 1")

    era_adjusted = tuple(normalisation.get("era_adjusted", ()))
    unknown_era = sorted(set(era_adjusted) - set(FEATURE_NAMES))
    if unknown_era:
        raise ScoringConfigError(
            f"normalisation.era_adjusted names an unknown feature: {unknown_era}"
        )
    weights = _parse_weights(raw_weights, "weights")
    performance_weights: dict[str, float] = {}
    if "performance" in data:
        performance = data["performance"]
        if not isinstance(performance, Mapping):
            raise ScoringConfigError("performance must be a table with weights")
        performance_weights = _parse_weights(performance.get("weights"), "performance weights")

    classic_min_seconds = data["stars"].get("classic_min_seconds", 0)
    if (
        not isinstance(classic_min_seconds, int | float)
        or isinstance(classic_min_seconds, bool)
        or classic_min_seconds < 0
    ):
        raise ScoringConfigError("stars.classic_min_seconds must be a number >= 0")
    thresholds = tuple(_parse_threshold(entry) for entry in raw_thresholds)
    _validate_thresholds(thresholds)
    floors: dict[str, float] = {}
    for key in ("knockout_min_stars", "submission_min_stars"):
        floor = data["stars"].get(key, 0)
        if (
            not isinstance(floor, int | float)
            or isinstance(floor, bool)
            or not (floor == 0 or floor in {t.stars for t in thresholds})
        ):
            raise ScoringConfigError(f"stars.{key} must be 0 or one of the star levels")
        floors[key] = float(floor)

    return ScoringConfig(
        version=version,
        description=str(data.get("description", "")),
        cap_quantile=float(cap_quantile),
        min_pool_size=min_pool_size,
        weights=weights,
        star_thresholds=thresholds,
        performance_weights=performance_weights,
        era_adjusted=era_adjusted,
        classic_min_seconds=float(classic_min_seconds),
        knockout_min_stars=floors["knockout_min_stars"],
        submission_min_stars=floors["submission_min_stars"],
    )


def _parse_weights(raw_weights: Any, label: str) -> dict[str, float]:
    if not raw_weights:
        raise ScoringConfigError(f"{label} must name at least one feature")
    unknown = sorted(set(raw_weights) - set(FEATURE_NAMES))
    if unknown:
        raise ScoringConfigError(f"{label} name an unknown feature: {unknown}")
    weights: dict[str, float] = {}
    for name, value in raw_weights.items():
        is_number = isinstance(value, int | float) and not isinstance(value, bool)
        if not is_number or not math.isfinite(value):
            raise ScoringConfigError(f"{label}: {name!r} must be a finite number")
        weights[name] = float(value)
    return weights


def _parse_threshold(entry: Any) -> StarThreshold:
    if not isinstance(entry, list) or len(entry) != 2:
        raise ScoringConfigError(f"star threshold must be [percentile, stars], got {entry!r}")
    percentile, stars = entry
    if not all(isinstance(x, int | float) and not isinstance(x, bool) for x in (percentile, stars)):
        raise ScoringConfigError(f"star threshold must be numeric, got {entry!r}")
    return StarThreshold(float(percentile), float(stars))


def _validate_thresholds(thresholds: tuple[StarThreshold, ...]) -> None:
    if not thresholds:
        raise ScoringConfigError("stars.thresholds is empty")
    if thresholds[0].min_percentile != 0:
        raise ScoringConfigError("the first star threshold must start at percentile 0")
    for current, following in zip(thresholds, thresholds[1:], strict=False):
        if following.min_percentile <= current.min_percentile:
            raise ScoringConfigError("star thresholds must have strictly ascending percentiles")
        if following.stars <= current.stars:
            raise ScoringConfigError("star thresholds must have strictly ascending stars")
    for t in thresholds:
        if not 0 <= t.min_percentile < 100:
            raise ScoringConfigError(f"threshold percentile out of range: {t.min_percentile}")
        if not 1.0 <= t.stars <= 5.0 or (t.stars * 2) != round(t.stars * 2):
            raise ScoringConfigError(f"stars must be a half-star step in 1.0..5.0, got {t.stars}")


def load_scoring_config(directory: Path, version: int) -> ScoringConfig:
    path = directory / f"scoring_v{version}.toml"
    try:
        with path.open("rb") as handle:
            data = tomllib.load(handle)
    except FileNotFoundError as exc:
        raise ScoringConfigError(f"scoring config not found: {path}") from exc
    except tomllib.TOMLDecodeError as exc:
        raise ScoringConfigError(f"invalid TOML in {path}: {exc}") from exc
    config = parse_scoring_config(data)
    if config.version != version:
        raise ScoringConfigError(
            f"{path.name} declares version {config.version}, expected {version}"
        )
    return config
