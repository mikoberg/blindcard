"""Orchestration: backfill, ingest-latest and rescore.

Rules enforced here:
  * Idempotent: events already complete in the database are skipped; re-runs change nothing.
  * "Complete" = every fight has a result AND consistent round data. Incomplete events are
    stored as far as parsed and retried on the next run (the source can lag on round stats).
  * Never guess: a fight that cannot be scored stays unscored, is logged, and (for
    ingest-latest) makes the run fail.
"""

from __future__ import annotations

import datetime as dt
import logging
from collections import Counter
from collections.abc import Collection
from dataclasses import dataclass, field
from pathlib import Path

from blindcard_ingest.db.repository import Repository
from blindcard_ingest.models import ParsedEvent
from blindcard_ingest.scoring.config import load_scoring_config
from blindcard_ingest.scoring.features import compute_raw_features, scoring_problems
from blindcard_ingest.scoring.scorer import build_reference, score
from blindcard_ingest.sources.base import FightDataSource

logger = logging.getLogger(__name__)

#: An incomplete event younger than this is normal (the source is still filling in stats).
INCOMPLETE_GRACE_DAYS = 2
#: ingest-latest only looks at events newer than this many days by default.
DEFAULT_SINCE_DAYS = 21


@dataclass
class IngestReport:
    events_considered: int = 0
    events_stored: int = 0
    events_complete: int = 0
    events_pending: int = 0  # incomplete, but young enough that the source may still be catching up
    events_incomplete_overdue: int = 0
    events_failed: int = 0
    fights_scored: int = 0
    fights_unscored: int = 0
    errors: list[str] = field(default_factory=list)

    @property
    def has_errors(self) -> bool:
        return bool(self.errors)

    def summary(self) -> str:
        return (
            f"events considered={self.events_considered} stored={self.events_stored} "
            f"complete={self.events_complete} pending={self.events_pending} "
            f"overdue={self.events_incomplete_overdue} failed={self.events_failed}; "
            f"fights scored={self.fights_scored} unscored={self.fights_unscored}; "
            f"errors={len(self.errors)}"
        )


@dataclass
class RescoreReport:
    version: int
    pool_size: int = 0
    unscorable: int = 0
    stars_histogram: dict[float, int] = field(default_factory=dict)
    dry_run: bool = False


def ingest_events(
    source: FightDataSource,
    repo: Repository,
    events: list[ParsedEvent],
    *,
    refresh: bool,
    dry_run: bool,
    today: dt.date,
    incomplete_is_error: bool,
    report: IngestReport,
) -> list[str]:
    """Fetch and store each event. Returns the source ids of events that are complete."""
    complete_ids: list[str] = []
    for event in events:
        report.events_considered += 1
        try:
            bundle = source.fetch_event(event, refresh=refresh)
        except Exception as exc:  # per-event isolation: one bad page must not kill the run
            logger.exception("failed to fetch/parse event %s (%s)", event.source_id, event.name)
            report.events_failed += 1
            report.errors.append(f"event {event.source_id}: {type(exc).__name__}: {exc}")
            continue

        problems = {
            fight.source_id: fight.completeness_problems()
            for fight in bundle.fights
            if fight.completeness_problems()
        }
        if not bundle.fights:
            problems["*"] = ["event has no fights yet"]

        if dry_run:
            logger.info(
                "[dry-run] would store event %s (%d fights)", event.name, len(bundle.fights)
            )
        else:
            try:
                repo.upsert_event_bundle(source.name, source.promotion, bundle)
            except Exception as exc:
                logger.exception("failed to store event %s", event.source_id)
                report.events_failed += 1
                report.errors.append(f"event {event.source_id}: store failed: {exc}")
                continue
            report.events_stored += 1

        if not problems:
            report.events_complete += 1
            complete_ids.append(event.source_id)
            continue

        age_days = (today - event.event_date).days
        for fight_id, reasons in problems.items():
            logger.warning(
                "event %s fight %s incomplete: %s", event.source_id, fight_id, "; ".join(reasons)
            )
        if age_days <= INCOMPLETE_GRACE_DAYS:
            report.events_pending += 1
            logger.info(
                "event %s is still incomplete (%d days old); will retry", event.name, age_days
            )
        else:
            report.events_incomplete_overdue += 1
            if incomplete_is_error:
                report.errors.append(
                    f"event {event.source_id} ({event.name}) still incomplete after {age_days} days"
                )
    return complete_ids


def score_events(
    source: FightDataSource,
    repo: Repository,
    event_source_ids: Collection[str],
    *,
    report: IngestReport,
) -> None:
    """Score unscored fights of the given events against the active (frozen) version."""
    if not event_source_ids:
        return
    active = repo.get_active_scoring_version()
    if active is None:
        message = "no active scoring version; run `rescore --version 1 --activate` first"
        logger.error(message)
        report.errors.append(message)
        return

    pending = repo.scoring_inputs(
        source=source.name,
        event_source_ids=event_source_ids,
        missing_score_for_version=active.config.version,
    )
    scored = []
    for item in pending:
        problems = scoring_problems(item.input)
        if problems:
            report.fights_unscored += 1
            reason = "; ".join(problems)
            logger.warning("fight %s left unscored: %s", item.fight_id, reason)
            report.errors.append(f"fight {item.fight_id} unscored: {reason}")
            continue
        raw = compute_raw_features(item.input)
        scored.append((item.fight_id, score(active.config, active.reference, raw)))
    if scored:
        repo.save_scores(active.config.version, scored)
    report.fights_scored += len(scored)


def run_ingest_latest(
    source: FightDataSource,
    repo: Repository,
    *,
    today: dt.date,
    since_days: int = DEFAULT_SINCE_DAYS,
    dry_run: bool = False,
) -> IngestReport:
    """Ingest recent completed events that are not yet complete, then score their fights."""
    report = IngestReport()
    cutoff = today - dt.timedelta(days=since_days)
    recent = [e for e in source.list_completed_events() if e.event_date >= cutoff]
    done = repo.complete_event_source_ids(source.name)
    targets = sorted((e for e in recent if e.source_id not in done), key=lambda e: e.event_date)
    logger.info(
        "ingest-latest: %d recent events, %d already complete, %d to ingest",
        len(recent),
        len(recent) - len(targets),
        len(targets),
    )
    complete_ids = ingest_events(
        source,
        repo,
        targets,
        refresh=True,
        dry_run=dry_run,
        today=today,
        incomplete_is_error=True,
        report=report,
    )
    if not dry_run:
        score_events(source, repo, complete_ids, report=report)
    logger.info("ingest-latest finished: %s", report.summary())
    return report


def run_backfill(
    source: FightDataSource,
    repo: Repository,
    *,
    from_year: int,
    today: dt.date,
    dry_run: bool = False,
) -> IngestReport:
    """Ingest all completed events from `from_year` on. Scoring is a separate `rescore` step."""
    report = IngestReport()
    events = [e for e in source.list_completed_events() if e.event_date.year >= from_year]
    done = repo.complete_event_source_ids(source.name)
    targets = sorted((e for e in events if e.source_id not in done), key=lambda e: e.event_date)
    logger.info(
        "backfill from %d: %d events, %d already complete, %d to ingest",
        from_year,
        len(events),
        len(events) - len(targets),
        len(targets),
    )
    ingest_events(
        source,
        repo,
        targets,
        refresh=False,
        dry_run=dry_run,
        today=today,
        incomplete_is_error=False,
        report=report,
    )
    logger.info("backfill finished: %s", report.summary())
    return report


def run_rescore(
    repo: Repository,
    config_dir: Path,
    version: int,
    *,
    activate: bool = False,
    dry_run: bool = False,
) -> RescoreReport:
    """Rebuild the frozen reference for `version` from all scorable fights and rescore them all."""
    config = load_scoring_config(config_dir, version)
    report = RescoreReport(version=version, dry_run=dry_run)

    raws: list[tuple[str, dict[str, float]]] = []
    reasons: Counter[str] = Counter()
    for item in repo.scoring_inputs():
        problems = scoring_problems(item.input)
        if problems:
            report.unscorable += 1
            reasons.update(problems)
            logger.debug("fight %s unscorable: %s", item.fight_id, "; ".join(problems))
            continue
        raws.append((item.fight_id, compute_raw_features(item.input)))
    if reasons:
        logger.warning(
            "%d fights cannot be scored; most common reasons: %s",
            report.unscorable,
            reasons.most_common(5),
        )

    reference = build_reference(config, [raw for _, raw in raws])
    scored = [(fight_id, score(config, reference, raw)) for fight_id, raw in raws]
    report.pool_size = len(scored)
    report.stars_histogram = dict(sorted(Counter(s.stars for _, s in scored).items()))
    logger.info(
        "rescore v%d: pool=%d unscorable=%d stars=%s",
        version,
        report.pool_size,
        report.unscorable,
        report.stars_histogram,
    )
    if dry_run:
        return report

    make_active = activate or repo.get_active_scoring_version() is None
    repo.replace_version(config, reference, scored, activate=make_active)
    logger.info("rescore v%d stored (active=%s)", version, make_active)
    return report
