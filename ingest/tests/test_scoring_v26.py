"""Score v26 is v25 plus one more rule: a real submission finish is never rated below 3 stars."""

from __future__ import annotations

import tomllib

from blindcard_ingest.scoring.config import load_scoring_config
from blindcard_ingest.scoring.scorer import stars_with_gate
from blindcard_ingest.settings import INGEST_ROOT

CONFIG_DIR = INGEST_ROOT / "config"
SUB = {"fight_seconds": 57.0, "ko_finish": 0.0, "sub_finish": 1.0, "real_finish": 1.0}
KO = {"fight_seconds": 299.0, "ko_finish": 1.0, "sub_finish": 0.0, "real_finish": 1.0}


def test_a_quick_submission_is_never_below_the_floor_and_a_knockout_keeps_its_own() -> None:
    cfg = load_scoring_config(CONFIG_DIR, 26)
    assert cfg.submission_min_stars == 3.0 and cfg.knockout_min_stars == 3.0
    assert stars_with_gate(cfg, 20, SUB) == 3.0  # a 57-second standing guillotine: lifted from 2.0
    assert stars_with_gate(cfg, 99.5, {**SUB, "fight_seconds": 300.0}) == 5.0  # never lowered
    assert stars_with_gate(cfg, 20, KO) == 3.0


def test_nothing_else_is_lifted() -> None:
    cfg = load_scoring_config(CONFIG_DIR, 26)
    assert stars_with_gate(cfg, 20, {**SUB, "real_finish": 0.0}) == 2.0  # stopped by an injury
    assert stars_with_gate(cfg, 20, {**SUB, "sub_finish": 0.0}) == 2.0  # a decision
    older = load_scoring_config(CONFIG_DIR, 25)
    assert (
        older.submission_min_stars == 0.0 and stars_with_gate(older, 20, SUB) == 2.0
    )  # v25 stays as it was


def test_v26_is_v25_with_that_one_rule() -> None:
    v25 = tomllib.loads((CONFIG_DIR / "scoring_v25.toml").read_text(encoding="utf-8"))
    v26 = tomllib.loads((CONFIG_DIR / "scoring_v26.toml").read_text(encoding="utf-8"))
    assert v26["weights"] == v25["weights"] and v26["normalisation"] == v25["normalisation"]
    assert v26["stars"].pop("submission_min_stars") == 3.0
    assert v26["stars"] == v25["stars"]
