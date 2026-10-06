"""ingest-ranks: each fighter's UFC ranking going into a bout, from the history of Wikipedia's
"UFC rankings" article.

The ranking a fighter had before an event is the one in the last revision of the article from before
the event date (the page is updated every week, after the event). For an announced bout it is the
newest revision. A fighter is ranked in a division, so a fight takes the places of its two fighters
in the division of its weight class; catch weights and anyone not on that division's list have none.

This is public, pre-fight context like the record going in. Nothing about a result is read. Names
are matched without accents or punctuation and never guessed: a name that does not match has no
rank.
"""

from __future__ import annotations

import datetime as dt
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

from blindcard_ingest.db.repository import Repository
from blindcard_ingest.predict.types import RankBout
from blindcard_ingest.sources.wikipedia.ufc_rankings import (
    MIN_LISTED,
    division_of,
    normalise,
    parse_rankings,
    rank_lookup,
)

logger = logging.getLogger(__name__)


class RankingSource(Protocol):
    def ranking_revisions(self, since: dt.datetime) -> list[tuple[int, dt.datetime]]: ...

    def revision_wikitexts(self, revids: Sequence[int]) -> dict[int, str]: ...


@dataclass
class RanksReport:
    bouts: int = 0
    revisions_used: int = 0
    bouts_with_a_rank: int = 0
    ranked_sides: int = 0
    no_revision: int = 0
    #: revisions that could not be read (fewer than MIN_LISTED fighters), stepped back from
    unreadable_revisions: int = 0
    #: bouts left unranked because no readable revision was found close before them
    unreadable_bouts: int = 0


def revision_before(revisions: list[tuple[int, dt.datetime]], cutoff: dt.datetime) -> int | None:
    """The newest revision made before `cutoff` (revisions are oldest first)."""
    found: int | None = None
    for revid, when in revisions:
        if when < cutoff:
            found = revid
        else:
            break
    return found


#: How many revisions back a bout may step when the one before its event could not be read.
MAX_STEPS_BACK = 12
LOOK_BACK_DAYS = 90


def _readable(text: str | None, minimum: int) -> bool:
    return text is not None and len(parse_rankings(text)) >= minimum


def _cutoff(day: dt.date) -> dt.datetime:
    """Midnight at the start of the event's date, UTC: edits made on the day itself, which may
    already follow the event, are never used."""
    return dt.datetime.combine(day, dt.time(0, 0), tzinfo=dt.UTC)


def ranks_for(
    bouts: Sequence[RankBout],
    revision_of: dict[str, int],
    texts: dict[int, str],
) -> dict[str, tuple[int | None, int | None]]:
    """(rank of the first fighter, rank of the second) per bout; None = not ranked."""
    lookups: dict[int, dict[tuple[str, str], int]] = {}
    ranks: dict[str, tuple[int | None, int | None]] = {}
    for bout in bouts:
        revid = revision_of.get(bout.key)
        division = division_of(bout.weight_class)
        if revid is None or revid not in texts or division is None:
            ranks[bout.key] = (None, None)
            continue
        if revid not in lookups:
            lookups[revid] = rank_lookup(parse_rankings(texts[revid]))
        lookup = lookups[revid]
        ranks[bout.key] = (
            lookup.get((division, normalise(bout.a_name))),
            lookup.get((division, normalise(bout.b_name))),
        )
    return ranks


def run_ingest_ranks(
    source: RankingSource,
    repo: Repository,
    *,
    from_year: int,
    dry_run: bool = False,
    min_listed: int = MIN_LISTED,
) -> RanksReport:
    done = repo.rank_bouts(from_year)
    coming = repo.rank_bouts_upcoming()
    report = RanksReport(bouts=len(done) + len(coming))
    if not done and not coming:
        logger.info("ingest-ranks: nothing to rank")
        return report
    # Some weeks before the first event, so that an unreadable revision can be stepped back from.
    first = min([b.event_date for b in done] or [dt.date.today()])
    since = _cutoff(first - dt.timedelta(days=LOOK_BACK_DAYS))
    revisions = source.ranking_revisions(since)
    if not revisions:
        logger.warning("ingest-ranks: the article has no revisions from that date on")
        report.no_revision = report.bouts
        return report

    revision_of: dict[str, int] = {}
    for bout in done:
        found = revision_before(revisions, _cutoff(bout.event_date))
        if found is None:
            report.no_revision += 1
        else:
            revision_of[bout.key] = found
    newest = revisions[-1][0]
    for bout in coming:
        revision_of[bout.key] = newest

    texts = source.revision_wikitexts(sorted(set(revision_of.values())))
    # A revision whose layout is not read gives no ranking at all, which is not the same as nobody
    # being ranked: step back to the revision before it (at most a few weeks older) instead.
    order = [revid for revid, _ in revisions]
    unreadable: set[int] = set()
    for _ in range(MAX_STEPS_BACK):
        bad = {
            r
            for r in set(revision_of.values())
            if r not in unreadable and not _readable(texts.get(r), min_listed)
        }
        if not bad:
            break
        unreadable |= bad
        for key, revid in list(revision_of.items()):
            if revid in bad:
                position = order.index(revid)
                if position == 0:
                    del revision_of[key]
                else:
                    revision_of[key] = order[position - 1]
        wanted = sorted({r for r in revision_of.values() if r not in texts})
        if wanted:
            texts.update(source.revision_wikitexts(wanted))
    for key, revid in list(revision_of.items()):
        if revid in unreadable or not _readable(texts.get(revid), min_listed):
            del revision_of[key]
    report.unreadable_revisions = len(unreadable)
    report.unreadable_bouts = (
        sum(1 for b in [*done, *coming] if b.key not in revision_of) - report.no_revision
    )
    report.revisions_used = len({r for r in revision_of.values()})

    done_ranks = ranks_for(done, revision_of, texts)
    coming_ranks = ranks_for(coming, revision_of, texts)
    for pair in [*done_ranks.values(), *coming_ranks.values()]:
        sides = sum(1 for rank in pair if rank is not None)
        report.ranked_sides += sides
        report.bouts_with_a_rank += 1 if sides else 0

    # Logs hold counts only.
    logger.info(
        "ingest-ranks%s: %d bouts, %d revisions read, %d bouts with a ranked fighter (%d places), "
        "%d unreadable revisions stepped back from, %d bouts left without one",
        " (dry run)" if dry_run else "",
        report.bouts,
        report.revisions_used,
        report.bouts_with_a_rank,
        report.ranked_sides,
        report.unreadable_revisions,
        report.unreadable_bouts,
    )
    if not dry_run:
        repo.set_fight_ranks(done_ranks)
        repo.set_upcoming_ranks(coming_ranks)
    return report
