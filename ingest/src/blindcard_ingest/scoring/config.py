"""Scoring configuration, loaded from `config/scoring_vN.toml` (stdlib tomllib) and validated."""

from __future__ import annotations

import math
import tomllib
from collections.abc import Mapping
from dataclasses import dataclass
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

    def to_json(self) -> dict[str, Any]:
        """JSON snapshot stored in `scoring_versions.config` for reproducibility."""
        return {
            "version": self.version,
            "description": self.description,
            "cap_quantile": self.cap_quantile,
            "min_pool_size": self.min_pool_size,
            "weights": dict(self.weights),
            "star_thresholds": [[t.min_percentile, t.stars] for t in self.star_thresholds],
        }

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

    if set(raw_weights) != set(FEATURE_NAMES):
        missing = sorted(set(FEATURE_NAMES) - set(raw_weights))
        extra = sorted(set(raw_weights) - set(FEATURE_NAMES))
        raise ScoringConfigError(
            f"weights must match the features (missing={missing}, extra={extra})"
        )
    weights: dict[str, float] = {}
    for name, value in raw_weights.items():
        is_number = isinstance(value, int | float) and not isinstance(value, bool)
        if not is_number or not math.isfinite(value):
            raise ScoringConfigError(f"weight {name!r} must be a finite number")
        weights[name] = float(value)

    thresholds = tuple(_parse_threshold(entry) for entry in raw_thresholds)
    _validate_thresholds(thresholds)

    return ScoringConfig(
        version=version,
        description=str(data.get("description", "")),
        cap_quantile=float(cap_quantile),
        min_pool_size=min_pool_size,
        weights=weights,
        star_thresholds=thresholds,
    )


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
