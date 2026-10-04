"""ingest-segments: which part of the card (main / prelims / early prelims) each fight was on.

A segment is a pre-fight fact and is shown publicly, but it is read from article text that also
holds results, so: logs carry counts only and nothing from the article is stored except the
segment of each matched fight. An event is stored only when every one of its fights was matched
unambiguously (see card_matching); anything else leaves the event without segments, and the web
app shows a flat card for it. Idempotent.
"""

from __future__ import annotations

import json
import logging
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from blindcard_ingest.bonus_matching import match_event_to_page
from blindcard_ingest.bonus_pipeline import BonusSource
from blindcard_ingest.card_matching import COMPLETE, resolve_segments
from blindcard_ingest.db.repository import Repository
from blindcard_ingest.sources.wikipedia.card import parse_card
from blindcard_ingest.sources.wikipedia.events_list import parse_events_list

logger = logging.getLogger(__name__)


@dataclass
class SegmentReport:
    events_considered: int = 0
    events_without_page: int = 0
    events_without_card: int = 0
    #: status of every other event: complete, single_card, count_mismatch, unmatched, order_mismatch
    statuses: Counter[str] = field(default_factory=Counter)
    fights_assigned: int = 0
    #: Per-event status for the LOCAL report file (public event names, no article text).
    details: list[dict[str, Any]] = field(default_factory=list)

    @property
    def events_segmented(self) -> int:
        return self.statuses[COMPLETE]

    @property
    def segmented_share(self) -> float:
        return self.events_segmented / self.events_considered if self.events_considered else 0.0

    def summary(self) -> str:
        others = " ".join(f"{k}={v}" for k, v in sorted(self.statuses.items()) if k != COMPLETE)
        return (
            f"events considered={self.events_considered} segmented={self.events_segmented} "
            f"({self.segmented_share:.0%}) fights={self.fights_assigned} | not segmented: "
            f"no page={self.events_without_page} no card={self.events_without_card} {others}"
        ).strip()


def run_ingest_segments(
    source: BonusSource,
    repo: Repository,
    *,
    source_name: str,
    from_year: int,
    report_path: Path | None = None,
    dry_run: bool = False,
) -> SegmentReport:
    report = SegmentReport()
    events = repo.events_for_bonus_matching(source_name, from_year)
    report.events_considered = len(events)
    wiki_events = parse_events_list(source.events_list_wikitext())

    page_of = {e.source_id: match_event_to_page(e.name, e.event_date, wiki_events) for e in events}
    texts = source.page_wikitexts(sorted({p.title for p in page_of.values() if p is not None}))

    to_store: dict[str, str] = {}
    for event in events:
        detail: dict[str, Any] = {"event_source_id": event.source_id, "event_name": event.name}
        page = page_of[event.source_id]
        wikitext = texts.get(page.title) if page is not None else None
        if page is None or wikitext is None:
            report.events_without_page += 1
            detail["status"] = "no_page"
        elif (bouts := parse_card(wikitext)) is None:
            report.events_without_card += 1
            detail["status"] = "no_card"
        else:
            resolution = resolve_segments(bouts, event.fights)
            report.statuses[resolution.status] += 1
            detail["status"] = resolution.status
            if resolution.complete:
                to_store.update(resolution.segments_by_fight)
        report.details.append(detail)

    report.fights_assigned = len(to_store)
    if not dry_run and to_store:
        updated = repo.set_card_segments(source_name, to_store)
        logger.info("stored card segments for %d fights", updated)
    if report_path is not None:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report.details, ensure_ascii=False, indent=1), "utf-8")
    logger.info("ingest-segments%s: %s", " (dry run)" if dry_run else "", report.summary())
    return report
