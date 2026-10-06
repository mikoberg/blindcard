"""prune-scores: free database space by dropping the per-fight scores of old score versions.

Every `rescore` keeps all of a version's per-fight scores and features, and only the active version
is ever read. The features of one version are about 15 MB, so twenty old versions are most of a
development database. A version's config and reference stay in `scoring_versions`, and a dropped
version can be rebuilt with `rescore --version N` (the config files are in the repository).

The active version is never touched. Logs carry version numbers and row counts only.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from blindcard_ingest.db.repository import Repository

logger = logging.getLogger(__name__)


@dataclass
class PruneReport:
    versions: list[int] = field(default_factory=list)
    scores: int = 0
    features: int = 0


def run_prune_scores(
    repo: Repository, *, keep: int = 2, reclaim: bool = False, dry_run: bool = False
) -> PruneReport:
    report = PruneReport(versions=repo.old_score_versions(keep))
    if not report.versions:
        logger.info("prune-scores: nothing to drop (keeping %d versions)", keep)
        return report
    if not dry_run:
        report.scores, report.features = repo.prune_score_versions(report.versions)
        if reclaim:
            repo.reclaim_score_space()
    logger.info(
        "prune-scores%s: versions %s%s; %d score rows and %d feature rows %s",
        " (dry run)" if dry_run else "",
        ",".join(str(v) for v in report.versions),
        " (space reclaimed)" if reclaim and not dry_run else "",
        report.scores,
        report.features,
        "would go" if dry_run else "deleted",
    )
    return report
