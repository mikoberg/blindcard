"""Match Wikipedia bonus awards to our events and fights, conservatively.

Rules (never guess):
  * an event is matched to a page by date (a one-day difference is allowed for events
    outside the US) and, when several candidates remain, by name tokens;
  * names are compared as slugs (diacritics folded), then without generational suffixes
    (Jr, Sr, II, ...), then by a close spelling that must be unique;
  * every award must resolve to exactly one fight of THAT event; one unresolved award makes the
    whole event "incomplete" and the caller must not store any of its labels.
"""

from __future__ import annotations

import datetime as dt
import difflib
import re
from collections.abc import Sequence
from dataclasses import dataclass, field

from blindcard_ingest.models import slugify
from blindcard_ingest.sources.wikipedia.bonuses import (
    FIGHT_OF_THE_NIGHT,
    PERFORMANCE_OF_THE_NIGHT,
    BonusAwards,
)
from blindcard_ingest.sources.wikipedia.events_list import WikiEvent

_SUFFIXES = frozenset({"jr", "sr", "ii", "iii", "iv"})
_FUZZY_CUTOFF = 0.85
_FUZZY_MARGIN = 0.05
_NAME_OVERLAP_MIN = 0.3
_TOKEN = re.compile(r"[a-z0-9]+")


@dataclass(frozen=True)
class FightNames:
    source_id: str
    names: tuple[str, str]


@dataclass(frozen=True)
class EventToLabel:
    """One stored event with its fights' fighter names: what awards must be matched against."""

    source_id: str
    name: str
    event_date: dt.date
    fights: tuple[FightNames, ...]


@dataclass(frozen=True)
class AwardResolution:
    bonuses_by_fight: dict[str, tuple[str, ...]] = field(default_factory=dict)
    awards_total: int = 0
    unresolved: int = 0
    #: Names that found no fight. These are award data (a result): for the local report file
    #: only, never for logs.
    unresolved_names: tuple[str, ...] = ()

    @property
    def complete(self) -> bool:
        """Every named award found its fight, and there was at least one award."""
        return self.awards_total > 0 and self.unresolved == 0


def _tokens(text: str) -> set[str]:
    return set(_TOKEN.findall(text.lower()))


def match_event_to_page(
    name: str, event_date: dt.date, wiki_events: Sequence[WikiEvent]
) -> WikiEvent | None:
    near = [w for w in wiki_events if abs((w.date - event_date).days) <= 1]
    if not near:
        return None
    exact = [w for w in near if w.date == event_date]
    pool = exact or near
    wanted = _tokens(name)

    def overlap(candidate: WikiEvent) -> float:
        other = _tokens(candidate.display)
        return len(wanted & other) / max(1, len(wanted | other))

    if len(pool) == 1:
        only = pool[0]
        # A different day is only believable when the names agree as well.
        return only if exact or overlap(only) >= _NAME_OVERLAP_MIN else None
    scored = sorted(((overlap(w), w) for w in pool), key=lambda pair: -pair[0])
    best_score, best = scored[0]
    if best_score > 0 and best_score > scored[1][0]:
        return best
    return None


def _strip_suffix(slug: str) -> str:
    parts = slug.split("-")
    while len(parts) > 1 and parts[-1] in _SUFFIXES:
        parts.pop()
    return "-".join(parts)


class _EventIndex:
    """Fighter name -> fight id for one event; a name that maps to two fights is ambiguous."""

    def __init__(self, fights: Sequence[FightNames]) -> None:
        self._exact: dict[str, str | None] = {}
        self._stripped: dict[str, str | None] = {}
        for fight in fights:
            for name in fight.names:
                slug = slugify(name)
                self._put(self._exact, slug, fight.source_id)
                self._put(self._stripped, _strip_suffix(slug), fight.source_id)

    @staticmethod
    def _put(table: dict[str, str | None], key: str, fight_id: str) -> None:
        if key in table and table[key] != fight_id:
            table[key] = None
        else:
            table[key] = fight_id

    def resolve(self, name: str) -> str | None:
        slug = slugify(name)
        if slug in self._exact:
            return self._exact[slug]
        stripped = _strip_suffix(slug)
        if stripped in self._stripped:
            return self._stripped[stripped]
        ranked = sorted(
            ((difflib.SequenceMatcher(None, stripped, key).ratio(), key) for key in self._stripped),
            reverse=True,
        )
        if not ranked or ranked[0][0] < _FUZZY_CUTOFF:
            return None
        if len(ranked) > 1 and ranked[1][0] > ranked[0][0] - _FUZZY_MARGIN:
            return None  # two equally plausible candidates: refuse
        return self._stripped[ranked[0][1]]


def resolve_awards(awards: BonusAwards, fights: Sequence[FightNames]) -> AwardResolution:
    index = _EventIndex(fights)
    labels: dict[str, set[str]] = {}
    missed: list[str] = []
    total = unresolved = 0

    for group in awards.fights_of_the_night:
        total += 1
        fight_ids = {index.resolve(name) for name in group}
        if len(fight_ids) == 1 and None not in fight_ids:
            labels.setdefault(next(iter(fight_ids)), set()).add(FIGHT_OF_THE_NIGHT)  # type: ignore[arg-type]
        else:
            unresolved += 1
            missed.append(" vs ".join(group))

    for name in awards.performers_of_the_night:
        total += 1
        fight_id = index.resolve(name)
        if fight_id is None:
            unresolved += 1
            missed.append(name)
        else:
            labels.setdefault(fight_id, set()).add(PERFORMANCE_OF_THE_NIGHT)

    return AwardResolution(
        bonuses_by_fight={fid: tuple(sorted(found)) for fid, found in labels.items()},
        awards_total=total,
        unresolved=unresolved,
        unresolved_names=tuple(missed),
    )
