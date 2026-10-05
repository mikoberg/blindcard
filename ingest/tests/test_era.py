"""Pace-like features are compared with fights of their own era."""

from __future__ import annotations

import pytest

from blindcard_ingest.scoring.config import parse_scoring_config
from blindcard_ingest.scoring.features import FEATURE_NAMES
from blindcard_ingest.scoring.scorer import (
    Reference,
    apply_era,
    build_reference,
    era_scales,
    score,
)

THRESHOLDS = [[0, 1.0], [50, 3.0], [90, 5.0]]


def raw(year: int, pace: float, volume: float | None = None) -> dict[str, float]:
    values = {name: 0.0 for name in FEATURE_NAMES}
    values.update(
        event_year=float(year),
        pace=pace,
        volume=pace * 25 if volume is None else volume,  # a longer or busier fight lands more
        min_pace=pace / 3,
    )
    return values


def config(era: list[str] | None):
    normalisation = {"cap_quantile": 1.0, "min_pool_size": 1}
    if era is not None:
        normalisation["era_adjusted"] = era
    return parse_scoring_config(
        {
            "version": 12,
            "normalisation": normalisation,
            "weights": {"pace": 1.0, "volume": 1.0},
            "stars": {"thresholds": THRESHOLDS},
        }
    )


def pool() -> list[dict[str, float]]:
    # Old fights are slow (pace 4), new ones fast (pace 8); 100 of each, so windows are full.
    return [raw(2010, 4.0 + i * 0.001) for i in range(100)] + [
        raw(2022, 8.0 + i * 0.001) for i in range(100)
    ]


def test_slow_eras_are_scaled_up_and_fast_eras_down() -> None:
    scales = era_scales(pool())
    assert scales["2010"] > 1 > scales["2022"]
    assert scales["2010"] * 4.0 == pytest.approx(scales["2022"] * 8.0, rel=0.1)


def test_a_typical_fight_of_each_era_scores_alike() -> None:
    cfg = config(["pace", "volume"])
    reference = build_reference(cfg, pool())
    old, new = score(cfg, reference, raw(2010, 4.05)), score(cfg, reference, raw(2022, 8.05))
    assert abs(old.percentile - new.percentile) < 10


def test_without_era_adjustment_nothing_changes() -> None:
    cfg = config(None)
    reference = build_reference(cfg, pool())
    assert reference.era_scales == {}
    assert "era_scales" not in reference.to_json()
    assert (
        score(cfg, reference, raw(2010, 4.05)).percentile
        < score(cfg, reference, raw(2022, 8.05)).percentile
    )


def test_the_scales_survive_a_round_trip_and_old_references_still_load() -> None:
    cfg = config(["pace"])
    reference = build_reference(cfg, pool())
    again = Reference.from_json(reference.to_json())
    assert again.era_scales == reference.era_scales
    legacy = reference.to_json()
    legacy.pop("era_scales")
    assert Reference.from_json(legacy).era_scales == {}
    assert parse_scoring_config(  # the snapshot keeps the setting
        {
            "version": 12,
            "normalisation": {"cap_quantile": 1, "min_pool_size": 1, "era_adjusted": ["pace"]},
            "weights": {"pace": 1},
            "stars": {"thresholds": THRESHOLDS},
        }
    ).era_adjusted == ("pace",)


def test_a_year_outside_the_pool_uses_the_nearest_known_year_and_unknown_year_none() -> None:
    scales = era_scales(pool())
    assert apply_era(["pace"], scales, raw(2030, 8.0))["pace"] == pytest.approx(
        8.0 * scales["2022"]
    )
    assert apply_era(["pace"], scales, raw(0, 8.0))["pace"] == 8.0


def test_the_scale_is_bounded() -> None:
    extreme = [raw(2001, 0.01) for _ in range(100)] + [raw(2020, 9.0) for _ in range(100)]
    assert max(era_scales(extreme).values()) <= 2.5
