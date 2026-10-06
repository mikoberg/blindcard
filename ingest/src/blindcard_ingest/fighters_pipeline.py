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
from blindcard_ingest.sources.sherdog import SherdogPage, career_rows, record_before_bout
from blindcard_ingest.sources.wikipedia.countries import country_code
from blindcard_ingest.sources.wikipedia.fighter_birth import parse_birth_date
from blindcard_ingest.sources.wikipedia.fighter_record import (
    Record,
    RecordRow,
    career_bouts,
    parse_record_rows,
    record_before,
)
from blindcard_ingest.sources.wikipedia.fighter_style import parse_styles

logger = logging.getLogger(__name__)

#: Page titles to try, in order: the plain name, then the "(fighter)" disambiguation.
TITLE_SUFFIXES = ("", " (fighter)")
DEFAULT_BATCH_SIZE = 10


class CountrySource(Protocol):
    def country_for_fighter(self, name: str) -> str | None: ...


class SherdogSource(Protocol):
    def pages_for(self, name: str) -> list[SherdogPage]: ...


class PageSource(Protocol):
    def page_wikitexts(self, titles: Sequence[str], *, batch_size: int) -> dict[str, str]: ...

    def search_titles(self, query: str, *, limit: int = 3) -> list[str]: ...


@dataclass
class FighterReport:
    fighters: int = 0
    fighters_resolved: int = 0
    fighters_with_country: int = 0
    fighters_with_style: int = 0
    fighters_via_sherdog: int = 0
    fights_considered: int = 0
    fights_with_both_records: int = 0
    fights_with_one_record: int = 0

    def summary(self) -> str:
        return (
            f"fighters={self.fighters} resolved={self.fighters_resolved} "
            f"country={self.fighters_with_country} sherdog={self.fighters_via_sherdog} | "
            f"fights={self.fights_considered} "
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
    countries_source: CountrySource | None = None,
    sherdog: SherdogSource | None = None,
    only_missing: bool = False,
    use_wikipedia: bool = True,
    dry_run: bool = False,
) -> FighterReport:
    fights = repo.fights_with_sides(source_name, from_year)
    names: dict[str, str] = {}
    appearances: dict[str, list[_Appearance]] = defaultdict(list)
    stored: set[tuple[str, str]] = set()  # (fight, side) that already has a record
    for fight in fights:
        names[fight.a_source_id] = fight.a_name
        names[fight.b_source_id] = fight.b_name
        _add(appearances, fight, "a", fight.a_source_id, fight.b_name)
        _add(appearances, fight, "b", fight.b_source_id, fight.a_name)
        for side in ("a", "b"):
            if (fight.stored_records or {}).get(side):
                stored.add((fight.fight_source_id, side))
    if only_missing:
        # Only the bouts that still lack a record are looked up (and written): what is stored stays.
        appearances = defaultdict(
            list,
            {
                fighter: [a for a in found if (a.fight_source_id, a.side) not in stored]
                for fighter, found in appearances.items()
            },
        )
        names = {fighter: name for fighter, name in names.items() if appearances[fighter]}

    report = FighterReport(fighters=len(names), fights_considered=len(fights))
    countries: dict[str, str] = {}
    styles: dict[str, list[str]] = {}
    records: dict[str, dict[str, Any]] = defaultdict(dict)
    careers: dict[str, list[RecordRow]] = {}
    births: dict[str, dt.date] = {}
    pending = set(names)

    def take(fighter: str, text: str) -> bool:
        """Use `text` for `fighter` if it demonstrably is their page."""
        found = _records_for(parse_record_rows(text), appearances[fighter])
        if not found:
            return False  # a page, but not (demonstrably) this fighter's
        pending.discard(fighter)
        report.fighters_resolved += 1
        code = country_code(text)
        if code is not None:
            countries[fighter] = code
            report.fighters_with_country += 1
        born = parse_birth_date(text)
        if born is not None:
            births[fighter] = born
        labels = parse_styles(text)
        if labels:
            styles[fighter] = labels
            report.fighters_with_style += 1
        for fight_source_id, (side, record) in found.items():
            records[fight_source_id][side] = record_json(record)
        # The rest of the career (earlier fights, other promotions): result data, kept privately.
        careers[fighter] = career_bouts(
            parse_record_rows(text), {a.event_date for a in appearances[fighter]}
        )
        return True

    for suffix in TITLE_SUFFIXES if use_wikipedia else ():
        if not pending:
            break
        titles = {fighter: names[fighter] + suffix for fighter in pending}
        texts = source.page_wikitexts(sorted(set(titles.values())), batch_size=batch_size)
        for fighter in sorted(pending):
            text = texts.get(titles[fighter])
            if text is not None:
                take(fighter, text)

    # Third try: the search finds pages whose title has accents our source leaves out
    # ("Natalia Silva" -> "Natalia Silva (fighter)", "Maurício Ruffy").
    if pending and use_wikipedia:
        candidates = {
            fighter: source.search_titles(f"{names[fighter]} mixed martial artist")
            for fighter in sorted(pending)
        }
        wanted = sorted({title for found in candidates.values() for title in found})
        texts = source.page_wikitexts(wanted, batch_size=batch_size) if wanted else {}
        for fighter in sorted(pending):
            for title in candidates[fighter]:
                text = texts.get(title)
                if text is not None and take(fighter, text):
                    break

    # Fighters without an article of their own: Sherdog's pro history gives the record.
    if sherdog is not None:
        for fighter in sorted(pending):
            for page in sherdog.pages_for(names[fighter]):
                found = _sherdog_records(page, appearances[fighter])
                if not found:
                    continue
                pending.discard(fighter)
                report.fighters_resolved += 1
                report.fighters_via_sherdog += 1
                if page.country is not None and fighter not in countries:
                    countries[fighter] = page.country
                    report.fighters_with_country += 1
                for fight_source_id, (side, record) in found.items():
                    records[fight_source_id][side] = record_json(record)
                careers[fighter] = career_rows(
                    page.bouts, {a.event_date for a in appearances[fighter]}
                )
                if page.birth_date is not None and fighter not in births:
                    births[fighter] = page.birth_date
                break

    # Fighters without an article of their own: Wikidata's one-line description names the country.
    if countries_source is not None:
        for fighter in sorted(set(names) - set(countries)):
            code = countries_source.country_for_fighter(names[fighter])
            if code is not None:
                countries[fighter] = code
                report.fighters_with_country += 1

    for payload in records.values():
        if len(payload) == 2:
            report.fights_with_both_records += 1
        else:
            report.fights_with_one_record += 1

    if not dry_run:
        changed_countries = repo.set_fighter_countries(source_name, countries)
        changed_records = repo.set_fight_records(source_name, records)
        changed_styles = repo.set_fighter_styles(source_name, styles)
        stored_bouts = repo.set_fighter_bouts(source_name, careers)
        repo.set_fighter_birth_dates(source_name, births)
        logger.info(
            "ingest-fighters: %d countries, %d fights' records, %d styles, %d other bouts changed",
            changed_countries,
            changed_records,
            changed_styles,
            stored_bouts,
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


def _sherdog_records(
    page: SherdogPage, appearances: list[_Appearance]
) -> dict[str, tuple[str, Record]]:
    found: dict[str, tuple[str, Record]] = {}
    for appearance in appearances:
        record = record_before_bout(page.bouts, appearance.event_date, appearance.opponent_name)
        if record is not None:
            found[appearance.fight_source_id] = (appearance.side, record)
    return found


def _records_for(
    rows: list[RecordRow], appearances: list[_Appearance]
) -> dict[str, tuple[str, Record]]:
    found: dict[str, tuple[str, Record]] = {}
    for appearance in appearances:
        record = record_before(rows, appearance.event_date, appearance.opponent_name)
        if record is not None:
            found[appearance.fight_source_id] = (appearance.side, record)
    return found
