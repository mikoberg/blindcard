"""Score v23 is v22 with one swapped feature; both configs must stay loadable and comparable."""

from __future__ import annotations

from blindcard_ingest.settings import INGEST_ROOT

CONFIG_DIR = INGEST_ROOT / "config"


def weights(text: str) -> dict[str, float]:
    import tomllib

    return {k: float(v) for k, v in tomllib.loads(text)["weights"].items()}


def test_v23_differs_from_v22_only_in_the_control_weight() -> None:
    v22 = weights((CONFIG_DIR / "scoring_v22.toml").read_text(encoding="utf-8"))
    v23 = weights((CONFIG_DIR / "scoring_v23.toml").read_text(encoding="utf-8"))
    assert v22.pop("control_share_nofinish") == v23.pop("control_stalling") == -0.36
    assert v22 == v23  # every other weight is v22's, to the digit


def test_both_versions_load_through_the_real_loader() -> None:
    from blindcard_ingest.scoring.config import load_scoring_config

    for version in (22, 23):
        config = load_scoring_config(CONFIG_DIR, version)
        assert config.version == version
