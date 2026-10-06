"""Score v25 is v24 plus one editorial rule: a real knockout is never rated below 3 stars."""

from __future__ import annotations

import tomllib

import pytest

from blindcard_ingest.scoring.config import (
    ScoringConfigError,
    load_scoring_config,
    parse_scoring_config,
)
from blindcard_ingest.scoring.scorer import stars_with_gate
from blindcard_ingest.settings import INGEST_ROOT

CONFIG_DIR = INGEST_ROOT / "config"
THRESHOLDS = [[0, 1.0], [16, 2.0], [40, 3.0], [70, 4.0], [90, 5.0]]


def config(floor: float | None):  # type: ignore[no-untyped-def]
    stars: dict[str, object] = {"thresholds": THRESHOLDS}
    if floor is not None:
        stars["knockout_min_stars"] = floor
    return parse_scoring_config(
        {
            "version": 99,
            "normalisation": {"cap_quantile": 1, "min_pool_size": 1},
            "weights": {"pace": 1.0},
            "stars": stars,
        }
    )


KO = {"fight_seconds": 299.0, "ko_finish": 1.0, "real_finish": 1.0}


def test_a_real_knockout_never_gets_fewer_stars_than_the_floor() -> None:
    cfg = config(3.0)
    assert stars_with_gate(cfg, 20, KO) == 3.0  # a quiet one-sided KO: lifted from 2.0
    assert stars_with_gate(cfg, 2, KO) == 3.0
    assert stars_with_gate(cfg, 95, KO) == 5.0  # never lowered
    assert stars_with_gate(cfg, 50, KO) == 3.0


def test_nothing_else_is_lifted() -> None:
    cfg = config(3.0)
    assert stars_with_gate(cfg, 20, {**KO, "ko_finish": 0.0}) == 2.0  # a submission or a decision
    assert stars_with_gate(cfg, 20, {**KO, "real_finish": 0.0}) == 2.0  # stopped by an injury
    assert stars_with_gate(config(None), 20, KO) == 2.0  # no rule, no change


def test_the_floor_survives_the_stored_snapshot_and_must_be_a_star_level() -> None:
    assert type(config(3.0)).from_json(config(3.0).to_json()).knockout_min_stars == 3.0
    assert "knockout_min_stars" not in config(None).to_json()
    with pytest.raises(ScoringConfigError):
        config(2.7)


def test_v25_is_v24_with_that_one_rule() -> None:
    v24 = tomllib.loads((CONFIG_DIR / "scoring_v24.toml").read_text(encoding="utf-8"))
    v25 = tomllib.loads((CONFIG_DIR / "scoring_v25.toml").read_text(encoding="utf-8"))
    assert v25["weights"] == v24["weights"] and v25["normalisation"] == v24["normalisation"]
    assert v25["stars"].pop("knockout_min_stars") == 3.0
    assert v25["stars"] == v24["stars"]
    assert load_scoring_config(CONFIG_DIR, 25).knockout_min_stars == 3.0
