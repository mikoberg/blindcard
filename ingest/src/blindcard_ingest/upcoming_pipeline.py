"""ingest-upcoming: the announced cards of the coming events, with only pre-fight facts.

Idempotent: every run rebuilds the (small) upcoming tables from the current articles. An event
is only read while its date is still ahead (strictly after today). Once the date arrives the
stored rows stay as they were last read, and they are removed the day after. A card that already
shows any result is refused (see `parse_upcoming_card`), so results can never be stored here.
"""

from __future__ import annotations

import datetime as dt
import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Protocol

from blindcard_ingest.db.repository import Repository
from blindcard_ingest.judges import name_key
from blindcard_ingest.sources.ufc.event_times import (
    EventTimes,
    RobotsRefused,
    event_url_from_wikitext,
)
from blindcard_ingest.sources.wikipedia.events_list import parse_events_list
from blindcard_ingest.upcoming import (
    UpcomingEvent,
    event_slug,
    parse_location,
    parse_upcoming_card,
)

logger = logging.getLogger(__name__)

#: How far ahead events are listed. Cards further out are rarely announced yet.
HORIZON_DAYS = 150
#: Start times are only read for events this close: they are rarely announced earlier.
TIMES_HORIZON_DAYS = 45
#: Upcoming cards change daily (bouts are added and swapped), so their pages are re-read often.
PAGE_MAX_AGE_SECONDS = 6 * 3600


class UpcomingSource(Protocol):
    def events_list_wikitext(self) -> str: ...

    def page_wikitexts(
        self, titles: Sequence[str], *, max_age_seconds: float | None = None
    ) -> dict[str, str]: ...


class TimesSource(Protocol):
    def event_times(self, url: str, *, event_date: dt.date) -> EventTimes | None: ...


@dataclass
class UpcomingReport:
    events_listed: int = 0
    events_stored: int = 0
    events_without_page: int = 0
    events_without_card: int = 0
    events_refused: int = 0  # the article already shows results
    bouts: int = 0
    times_found: int = 0
    fighters_matched: int = 0
    fighters_unmatched: int = 0
    records_found: int = 0
    events: list[UpcomingEvent] = field(default_factory=list)


def _match_fighters(names: Sequence[str], index: dict[str, list[str]]) -> dict[str, str]:
    """Fighter id per name, only where exactly one stored fighter has that name."""
    found: dict[str, str] = {}
    for name in names:
        ids = index.get(name_key(name), [])
        if len(ids) == 1:
            found[name] = ids[0]
    return found


def run_ingest_upcoming(
    source: UpcomingSource,
    repo: Repository,
    *,
    today: dt.date,
    horizon_days: int = HORIZON_DAYS,
    times_source: TimesSource | None = None,
    dry_run: bool = False,
) -> UpcomingReport:
    report = UpcomingReport()
    listed = [
        e
        for e in parse_events_list(source.events_list_wikitext())
        if today < e.date <= today + dt.timedelta(days=horizon_days)
    ]
    report.events_listed = len(listed)
    texts = source.page_wikitexts(
        sorted({e.title for e in listed}), max_age_seconds=PAGE_MAX_AGE_SECONDS
    )

    events: list[UpcomingEvent] = []
    for entry in sorted(listed, key=lambda e: (e.date, e.title)):
        text = texts.get(entry.title)
        if text is None:
            report.events_without_page += 1
            continue
        card = parse_upcoming_card(text)
        if card is not None and card.has_results:
            report.events_refused += 1
            logger.warning("upcoming: an article already shows results; skipped")
            continue
        if card is None:
            report.events_without_card += 1
        times = EventTimes()
        url = event_url_from_wikitext(text)
        if (
            times_source is not None
            and url is not None
            and entry.date <= today + dt.timedelta(days=TIMES_HORIZON_DAYS)
        ):
            try:
                times = times_source.event_times(url, event_date=entry.date) or EventTimes()
            except RobotsRefused:
                logger.warning("start times: not allowed by robots.txt; none are read")
                times_source = None
        if times.known:
            report.times_found += 1
        events.append(
            UpcomingEvent(
                wiki_title=entry.title,
                name=entry.display,
                slug=event_slug(entry.display),
                event_date=entry.date,
                location=parse_location(text),
                bouts=card.bouts if card is not None else (),
                main_card_at=times.main_card,
                prelims_at=times.prelims,
                early_prelims_at=times.early_prelims,
            )
        )

    index: dict[str, list[str]] = {}
    for fighter_id, name in repo.fighter_names():
        index.setdefault(name_key(name), []).append(fighter_id)
    names = sorted({n for e in events for b in e.bouts for n in (b.a, b.b)})
    matched = _match_fighters(names, index)
    report.fighters_matched = len(matched)
    report.fighters_unmatched = len(names) - len(matched)
    report.events = events
    report.events_stored = len(events)
    report.bouts = sum(len(e.bouts) for e in events)
    logger.info(
        "ingest-upcoming%s: %d events listed, %d stored (%d without a card yet, %d refused), "
        "%d bouts, start times for %d, %d of %d fighters known",
        " (dry run)" if dry_run else "",
        report.events_listed,
        report.events_stored,
        report.events_without_card,
        report.events_refused,
        report.bouts,
        report.times_found,
        report.fighters_matched,
        len(names),
    )
    records = repo.fighter_current_records(set(matched.values()))
    if not dry_run:
        repo.replace_upcoming(events, matched, today=today, records=records)
    return report
