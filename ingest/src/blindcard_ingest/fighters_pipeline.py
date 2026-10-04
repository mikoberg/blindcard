"""ingest-fighters: each fighter's country and the records going into every bout.

Both come from the fighter's Wikipedia page (see sources/wikipedia): the country from the
infobox, the record BEFORE a bout from the record column of the bout just before it. The
page's headline record is never used (it includes every later bout, results included).

A page counts only when it demonstrably is the right person: one of the fighter's stored bouts
must appear in its table (same date, same opponent). Otherwise the fighter gets neither
country nor records. Logs carry counts only. Idempotent.
"""

from __future__ import annotations

import datetime as dt
import logging
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from blindcard_ingest.db.repository import FightSides, Repository
from blindcard_ingest.sources.wikipedia.countries import country_code
from blindcard_ingest.sources.wikipedia.fighter_record import (
    Record,
    RecordRow,
    parse_record_rows,
    record_before,
)

logger = logging.getLogger(__name__)

#: Page titles to try, in order: the plain name, then the "(fighter)" disambiguation.
TITLE_SUFFIXES = ("", " (fighter)")
DEFAULT_BATCH_SIZE = 10


class PageSource(Protocol):
    def page_wikitexts(self, titles: Sequence[str], *, batch_size: int) -> dict[str, str]: ...


@dataclass
class FighterReport:
    fighters: int = 0
    fighters_resolved: int = 0
    fighters_with_country: int = 0
    fights_considered: int = 0
    fights_with_both_records: int = 0
    fights_with_one_record: int = 0

    def summary(self) -> str:
        return (
            f"fighters={self.fighters} resolved={self.fighters_resolved} "
            f"country={self.fighters_with_country} | fights={self.fights_considered} "
            f"records: both={self.fights_with_both_records} one={self.fights_with_one_record}"
        )


@dataclass(frozen=True)
class _Appearance:
    fight_source_id: str
    side: str  # "a" or "b"
    event_date: dt.date
    opponent_name: str


def record_json(record: Record) -> dict[str, int]:
    return {
        "w": record.wins,
        "l": record.losses,
        "d": record.draws,
        "nc": record.no_contests,
    }


def run_ingest_fighters(
    source: PageSource,
    repo: Repository,
    *,
    source_name: str,
    from_year: int,
    batch_size: int = DEFAULT_BATCH_SIZE,
    dry_run: bool = False,
) -> FighterReport:
    fights = repo.fights_with_sides(source_name, from_year)
    names: dict[str, str] = {}
    appearances: dict[str, list[_Appearance]] = defaultdict(list)
    for fight in fights:
        names[fight.a_source_id] = fight.a_name
        names[fight.b_source_id] = fight.b_name
        _add(appearances, fight, "a", fight.a_source_id, fight.b_name)
        _add(appearances, fight, "b", fight.b_source_id, fight.a_name)

    report = FighterReport(fighters=len(names), fights_considered=len(fights))
    countries: dict[str, str] = {}
    records: dict[str, dict[str, Any]] = defaultdict(dict)
    pending = set(names)

    for suffix in TITLE_SUFFIXES:
        if not pending:
            break
        titles = {fighter: names[fighter] + suffix for fighter in pending}
        texts = source.page_wikitexts(sorted(set(titles.values())), batch_size=batch_size)
        for fighter in sorted(pending):
            text = texts.get(titles[fighter])
            if text is None:
                continue
            rows = parse_record_rows(text)
            found = _records_for(rows, appearances[fighter])
            if not found:
                continue  # a page, but not (demonstrably) this fighter's
            pending.discard(fighter)
            report.fighters_resolved += 1
            code = country_code(text)
            if code is not None:
                countries[fighter] = code
                report.fighters_with_country += 1
            for fight_source_id, (side, record) in found.items():
                records[fight_source_id][side] = record_json(record)

    for payload in records.values():
        if len(payload) == 2:
            report.fights_with_both_records += 1
        else:
            report.fights_with_one_record += 1

    if not dry_run:
        changed_countries = repo.set_fighter_countries(source_name, countries)
        changed_records = repo.set_fight_records(source_name, records)
        logger.info(
            "ingest-fighters: %d countries and %d fights' records changed",
            changed_countries,
            changed_records,
        )
    logger.info("ingest-fighters%s: %s", " (dry run)" if dry_run else "", report.summary())
    return report


def _add(
    appearances: dict[str, list[_Appearance]],
    fight: FightSides,
    side: str,
    fighter_id: str,
    opponent_name: str,
) -> None:
    appearances[fighter_id].append(
        _Appearance(fight.fight_source_id, side, fight.event_date, opponent_name)
    )


def _records_for(
    rows: list[RecordRow], appearances: list[_Appearance]
) -> dict[str, tuple[str, Record]]:
    found: dict[str, tuple[str, Record]] = {}
    for appearance in appearances:
        record = record_before(rows, appearance.event_date, appearance.opponent_name)
        if record is not None:
            found[appearance.fight_source_id] = (appearance.side, record)
    return found
