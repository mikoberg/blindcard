"""`fit-scoring`: fit the next score version to the bonus labels and write its config file."""

from __future__ import annotations

import logging
from pathlib import Path

from blindcard_ingest.db.repository import Repository
from blindcard_ingest.fit.dataset import build_rows
from blindcard_ingest.fit.recipe import (
    STAR_CURVE,
    FitResult,
    fit_scoring,
    format_report,
    render_config_toml,
)
from blindcard_ingest.scoring.config import StarThreshold
from blindcard_ingest.scoring.features import compute_raw_features, scoring_problems
from blindcard_ingest.scoring.scorer import ScoringError, score

logger = logging.getLogger(__name__)


def run_fit_scoring(
    repo: Repository,
    config_dir: Path,
    version: int,
    *,
    source_name: str,
    test_from_year: int,
    l2: float,
    finish_leak: float,
    dry_run: bool,
    overwrite: bool = False,
) -> FitResult:
    """Fit against the stored bonus labels and (unless `dry_run`) write `scoring_v{version}.toml`.

    The active version is the baseline of the comparison and donates the caps quantile and
    minimum pool size; the star curve is the recipe's own (`STAR_CURVE`). Its own config is
    never overwritten.
    """
    active = repo.get_active_scoring_version()
    if active is None:
        raise ScoringError("no active score version to compare against: run `rescore` first")
    if version == 1:
        raise ScoringError("v1 is the baseline and its config is never regenerated")
    if version == active.config.version:
        raise ScoringError(f"v{version} is the active version: pick a new version number")

    target = config_dir / f"scoring_v{version}.toml"
    if target.exists() and not overwrite and not dry_run:
        raise ScoringError(f"{target.name} already exists: pass --force to replace it")

    rows, skipped = build_rows(repo.labeled_fights(source_name))
    if not rows:
        raise ScoringError("no labelled fights: run `ingest-bonuses` first")
    pool = [
        compute_raw_features(item.input)
        for item in repo.scoring_inputs()
        if not scoring_problems(item.input)
    ]
    baseline = {
        row.fight_id: score(active.config, active.reference, row.raw).composite for row in rows
    }
    logger.info(
        "%d labelled fights (%d unscorable skipped), pool of %d for the caps",
        len(rows),
        skipped,
        len(pool),
    )

    try:
        result = fit_scoring(
            rows,
            pool,
            cap_quantile=active.config.cap_quantile,
            test_from_year=test_from_year,
            l2=l2,
            finish_leak=finish_leak,
            baseline=baseline,
        )
    except ValueError as exc:  # unusable labels or split: a configuration problem, not a crash
        raise ScoringError(str(exc)) from exc
    for line in format_report(result).splitlines():
        logger.info("%s", line)

    text = render_config_toml(
        result,
        version=version,
        cap_quantile=active.config.cap_quantile,
        min_pool_size=active.config.min_pool_size,
        star_thresholds=[StarThreshold(percentile, stars) for percentile, stars in STAR_CURVE],
    )
    if dry_run:
        logger.info("dry run: not writing %s", target.name)
    else:
        target.write_text(text, encoding="utf-8", newline="\n")
        logger.info("wrote %s", target)
        logger.info("next: `blindcard-ingest rescore --version %d` (without --activate)", version)
    return result
