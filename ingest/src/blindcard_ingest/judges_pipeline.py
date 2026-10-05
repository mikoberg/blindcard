"""ingest-judges: recompute the public judge statistics from the stored scorecards.

Idempotent and cheap: it rebuilds the whole (small) table every time, so it can run after every
ingest. Only aggregates are written; the scorecards themselves stay private.
"""

from __future__ import annotations

import logging

from blindcard_ingest.db.repository import Repository
from blindcard_ingest.judges import MIN_CARDS, JudgeReport, compute_judge_stats

logger = logging.getLogger(__name__)


def run_ingest_judges(repo: Repository, *, dry_run: bool = False) -> JudgeReport:
    report = compute_judge_stats(repo.decision_scorecards())
    enough = report.baseline.judges_with_enough
    logger.info(
        "ingest-judges%s: %d decisions (%d skipped), %d judges, %d with at least %d cards",
        " (dry run)" if dry_run else "",
        report.decisions,
        report.skipped,
        len(report.judges),
        enough,
        MIN_CARDS,
    )
    if not dry_run:
        repo.replace_judge_stats(report)
    return report
