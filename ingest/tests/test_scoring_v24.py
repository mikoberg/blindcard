"""Score v24: v23's grappling waiver, fitted, and the less active fighter's pace only counts in a
fight that did not end in a real finish (a one-sided KO is not a dull fight)."""

from __future__ import annotations

import tomllib

from blindcard_ingest.scoring.config import load_scoring_config
from blindcard_ingest.settings import INGEST_ROOT

CONFIG_DIR = INGEST_ROOT / "config"


def test_v24_loads_and_uses_the_nofinish_pace_instead_of_the_plain_one() -> None:
    config = load_scoring_config(CONFIG_DIR, 24)
    assert config.version == 24
    weights = tomllib.loads((CONFIG_DIR / "scoring_v24.toml").read_text(encoding="utf-8"))[
        "weights"
    ]
    assert "min_pace_nofinish" in weights and "min_pace" not in weights
    assert "control_stalling" in weights and "control_share_nofinish" not in weights
    assert weights["real_finish"] > 0  # a finish only ever adds
