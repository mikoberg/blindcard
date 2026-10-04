import dataclasses
import datetime as dt
from pathlib import Path

import pytest
from fakes import FakeRepository, make_bundle
from test_fit_recipe import synthetic_rows

from blindcard_ingest import cli
from blindcard_ingest.fit import run as fit_run
from blindcard_ingest.scoring.config import load_scoring_config
from blindcard_ingest.scoring.features import compute_raw_features
from blindcard_ingest.scoring.scorer import ScoringError, build_reference
from blindcard_ingest.settings import DEFAULT_SCORING_CONFIG_DIR


def repo_with_active_v1() -> FakeRepository:
    repo = FakeRepository()
    for i in range(120):
        repo.upsert_event_bundle(
            "ufcstats", "UFC", make_bundle(f"h{i}", dt.date(2020, 1, 1), fights=1, seed=i)
        )
    v1 = load_scoring_config(DEFAULT_SCORING_CONFIG_DIR, 1)
    pool = [compute_raw_features(item.input) for item in repo.scoring_inputs()]
    repo.versions[1] = (v1, build_reference(v1, pool))
    repo.active_version = 1
    return repo


def labelled(repo: FakeRepository) -> None:
    for fight_id in (
        list(repo.bonuses) or [f.source_id for b in repo.events.values() for f in b.fights[:1]][:3]
    ):
        repo.bonuses[fight_id] = ["fight_of_the_night"]


def run(
    repo: FakeRepository,
    tmp_path: Path,
    *,
    version: int = 2,
    dry_run: bool = False,
    overwrite: bool = False,
):
    return fit_run.run_fit_scoring(
        repo,
        tmp_path,
        version,
        source_name="ufcstats",
        test_from_year=2024,
        l2=5.0,
        finish_leak=0.25,
        dry_run=dry_run,
        overwrite=overwrite,
    )


def test_needs_an_active_version_and_labels(tmp_path: Path) -> None:
    with pytest.raises(ScoringError, match="rescore"):
        run(FakeRepository(), tmp_path)
    with pytest.raises(ScoringError, match="ingest-bonuses"):
        run(repo_with_active_v1(), tmp_path)


def test_the_active_version_is_never_overwritten(tmp_path: Path) -> None:
    repo = repo_with_active_v1()
    config, reference = repo.versions[1]
    repo.versions[2] = (dataclasses.replace(config, version=2), reference)
    repo.active_version = 2
    with pytest.raises(ScoringError, match="active version"):
        run(repo, tmp_path, version=2)
    assert list(tmp_path.iterdir()) == []


def test_v1_and_existing_files_are_never_replaced_by_accident(tmp_path: Path) -> None:
    repo = repo_with_active_v1()
    repo.versions[2] = repo.versions[1]
    repo.active_version = 2  # v1 is no longer active: still not regenerable
    with pytest.raises(ScoringError, match="never regenerated"):
        run(repo, tmp_path, version=1)
    (tmp_path / "scoring_v3.toml").write_text("keep me", encoding="utf-8")
    with pytest.raises(ScoringError, match="--force"):
        run(repo, tmp_path, version=3)
    assert (tmp_path / "scoring_v3.toml").read_text(encoding="utf-8") == "keep me"


def test_unusable_labels_are_a_configuration_error(tmp_path: Path) -> None:
    repo = repo_with_active_v1()
    labelled(repo)  # 2020 only: nothing on the held-out side
    with pytest.raises(ScoringError, match="both sides"):
        run(repo, tmp_path)


def test_writes_the_config_unless_dry_run(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    rows = synthetic_rows()
    canned = fit_run.fit_scoring(rows, [r.raw for r in rows], cap_quantile=0.99)
    monkeypatch.setattr(fit_run, "fit_scoring", lambda *a, **k: canned)
    repo = repo_with_active_v1()
    labelled(repo)

    run(repo, tmp_path, dry_run=True)
    assert list(tmp_path.iterdir()) == []

    result = run(repo, tmp_path)
    assert run(repo, tmp_path, overwrite=True) == result  # --force replaces it
    written = load_scoring_config(tmp_path, 2)
    assert written.weights == result.weights
    assert written.performance_weights == {}
    assert (
        written.star_thresholds
        == load_scoring_config(DEFAULT_SCORING_CONFIG_DIR, 1).star_thresholds
    )


def test_cli_accepts_fit_scoring_options() -> None:
    args = cli.build_parser().parse_args(["fit-scoring", "--version", "2", "--test-from", "2023"])
    assert (args.version, args.test_from_year, args.l2, args.dry_run) == (2, 2023, 5.0, False)
