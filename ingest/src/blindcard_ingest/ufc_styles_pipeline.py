"""ingest-ufc-styles: fill the styles that Wikipedia does not give from the official athlete pages.

The site is read slowly (its crawl delay is 15 s), so each run takes at most `limit` fighters: those
on an announced card first, then the most recently active. Every fighter that was asked is marked,
whatever came back, so nobody is asked again for months. One field of one page is read per fighter.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol

from blindcard_ingest.db.repository import Repository
from blindcard_ingest.sources.ufc.event_times import RobotsRefused

logger = logging.getLogger(__name__)

DEFAULT_LIMIT = 40
#: A fighter without a style there is looked at again after this many days.
RECHECK_AFTER_DAYS = 180


class AthleteSource(Protocol):
    def style_of(self, name: str) -> list[str] | None: ...


@dataclass
class UfcStylesReport:
    asked: int = 0
    with_style: int = 0
    no_page: int = 0
    stopped_by_robots: bool = False


def run_ingest_ufc_styles(
    repo: Repository,
    athletes: AthleteSource,
    *,
    limit: int = DEFAULT_LIMIT,
    dry_run: bool = False,
) -> UfcStylesReport:
    report = UfcStylesReport()
    results: dict[str, list[str] | None] = {}
    for candidate in repo.fighters_for_ufc_styles(limit, older_than_days=RECHECK_AFTER_DAYS):
        try:
            labels = athletes.style_of(candidate.name)
        except RobotsRefused:
            logger.warning("ufc styles: not allowed by robots.txt; none are read")
            report.stopped_by_robots = True
            break
        report.asked += 1
        if labels is None:
            report.no_page += 1
        elif labels:
            report.with_style += 1
        results[candidate.fighter_id] = labels
    # Logs carry counts only.
    logger.info(
        "ingest-ufc-styles%s: %d asked, %d with a style, %d without a matching page",
        " (dry run)" if dry_run else "",
        report.asked,
        report.with_style,
        report.no_page,
    )
    if results and not dry_run:
        repo.set_ufc_styles(results)
    return report
