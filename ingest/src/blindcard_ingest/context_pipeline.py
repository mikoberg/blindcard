"""ingest-context: store what was known about each bout's fighters before it (fights.career).

Rematch, win streaks and unbeaten status come from the fighters' EARLIER bouts, so they are
public pre-fight facts. The command recomputes them for every fight and only writes what
changed: it is idempotent, and cheap enough to run after every ingest.
"""

from __future__ import annotations

import logging

from blindcard_ingest.db.repository import Repository

logger = logging.getLogger(__name__)


def run_ingest_context(repo: Repository, *, source_name: str, dry_run: bool = False) -> int:
    if dry_run:
        logger.info("ingest-context (dry run): nothing written")
        return 0
    changed = repo.refresh_career_context(source_name)
    logger.info("ingest-context: career context changed for %d fights", changed)
    return changed
