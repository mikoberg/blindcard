"""ingest-bonuses: label fights with the UFC's post-fight bonuses (Wikipedia event articles).

The labels are RESULT data. Rules:
  * Logs carry counts only. Names of unmatched awards go to a local report file (gitignored
    cache directory) and nowhere else.
  * A missing label is not a negative label. An event is stored only when it names at least one
    award and EVERY named award found its fight; anything else leaves the event untouched, so
    "has at least one stored bonus" means "completely and unambiguously labelled".
  * Idempotent: re-running overwrites with the same values.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from blindcard_ingest.bonus_matching import match_event_to_page, resolve_awards
from blindcard_ingest.db.repository import Repository
from blindcard_ingest.sources.wikipedia.bonuses import (
    FIGHT_OF_THE_NIGHT,
    PERFORMANCE_OF_THE_NIGHT,
    parse_bonus_awards,
)
from blindcard_ingest.sources.wikipedia.events_list import parse_events_list

logger = logging.getLogger(__name__)


class BonusSource(Protocol):
    def events_list_wikitext(self) -> str: ...

    def page_wikitexts(self, titles: Sequence[str]) -> dict[str, str]: ...


@dataclass
class BonusReport:
    events_considered: int = 0
    events_without_page: int = 0
    events_without_section: int = 0
    events_without_awards: int = 0  # a bonus section exists but names no award
    events_incomplete: int = 0  # at least one named award found no fight
    events_labeled: int = 0
    awards_in_labeled_events: int = 0
    fights_fight_of_the_night: int = 0
    fights_performance_of_the_night: int = 0
    #: Per-event detail for the LOCAL report file only (contains award names).
    details: list[dict[str, Any]] = field(default_factory=list)

    @property
    def labeled_share(self) -> float:
        return self.events_labeled / self.events_considered if self.events_considered else 0.0

    def summary(self) -> str:
        """Counts only: safe for logs."""
        return (
            f"events considered={self.events_considered} labeled={self.events_labeled} "
            f"({self.labeled_share:.0%}) | not labeled: no page={self.events_without_page} "
            f"no section={self.events_without_section} no awards={self.events_without_awards} "
            f"incomplete={self.events_incomplete} | fights flagged: "
            f"fotn={self.fights_fight_of_the_night} potn={self.fights_performance_of_the_night}"
        )


def run_ingest_bonuses(
    source: BonusSource,
    repo: Repository,
    *,
    source_name: str,
    from_year: int,
    report_path: Path | None = None,
    dry_run: bool = False,
) -> BonusReport:
    report = BonusReport()
    events = repo.events_for_bonus_matching(source_name, from_year)
    report.events_considered = len(events)
    wiki_events = parse_events_list(source.events_list_wikitext())

    page_of = {e.source_id: match_event_to_page(e.name, e.event_date, wiki_events) for e in events}
    texts = source.page_wikitexts(sorted({p.title for p in page_of.values() if p is not None}))

    to_store: dict[str, tuple[str, ...]] = {}
    for event in events:
        detail: dict[str, Any] = {"event_source_id": event.source_id, "event_name": event.name}
        page = page_of[event.source_id]
        wikitext = texts.get(page.title) if page is not None else None
        if page is None or wikitext is None:
            report.events_without_page += 1
            detail["status"] = "no_page"
        elif (awards := parse_bonus_awards(wikitext)) is None:
            report.events_without_section += 1
            detail["status"] = "no_section"
        elif not awards.is_labeled:
            report.events_without_awards += 1
            detail["status"] = "no_awards"
        else:
            resolution = resolve_awards(awards, event.fights)
            if not resolution.complete:
                report.events_incomplete += 1
                detail["status"] = "incomplete"
                detail["unresolved_names"] = list(resolution.unresolved_names)
            else:
                report.events_labeled += 1
                report.awards_in_labeled_events += resolution.awards_total
                for bonuses in resolution.bonuses_by_fight.values():
                    report.fights_fight_of_the_night += FIGHT_OF_THE_NIGHT in bonuses
                    report.fights_performance_of_the_night += PERFORMANCE_OF_THE_NIGHT in bonuses
                to_store.update(resolution.bonuses_by_fight)
                detail["status"] = "labeled"
        report.details.append(detail)

    if not dry_run and to_store:
        updated = repo.set_bonuses(source_name, to_store)
        logger.info("stored bonus labels for %d fights", updated)
    if report_path is not None:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report.details, ensure_ascii=False, indent=1), "utf-8")
    logger.info("ingest-bonuses%s: %s", " (dry run)" if dry_run else "", report.summary())
    return report
