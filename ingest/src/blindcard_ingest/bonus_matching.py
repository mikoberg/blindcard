"""Match Wikipedia bonus awards to our events and fights, conservatively.

Rules (never guess):
  * an event is matched to a page by date (a one-day difference is allowed for events
    outside the US) and, when several candidates remain, by name tokens;
  * names are compared as slugs (diacritics folded) through ordered steps: exact, without
    generational suffixes (Jr, Sr, II, ...), same letters in another order, one name containing
    the other, a close spelling, and finally the same last name. Every step must find exactly
    ONE fighter of the event, otherwise the name stays unresolved;
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


def _slug_tokens(slug: str) -> list[str]:
    return [t for t in slug.split("-") if t and t not in _SUFFIXES]


def _letters(slug: str) -> str:
    """The slug's letters sorted: equal for the same name in another order or split."""
    return "".join(sorted(slug.replace("-", "")))


class EventIndex:
    """Fighters of one event, resolved to their fight by an ordered list of increasingly loose
    steps. EVERY step must find exactly one fighter: two candidates mean "refuse", never
    "pick one" and never "fall through to a weaker step"."""

    def __init__(self, fights: Sequence[FightNames]) -> None:
        # fighter slug -> fight id (None when the same slug appears in two fights)
        self._fighters: dict[str, str | None] = {}
        for fight in fights:
            for name in fight.names:
                slug = slugify(name)
                if slug in self._fighters and self._fighters[slug] != fight.source_id:
                    self._fighters[slug] = None
                else:
                    self._fighters[slug] = fight.source_id

    def _exact(self, slug: str) -> set[str]:
        return {slug} if slug in self._fighters else set()

    def _without_suffix(self, slug: str) -> set[str]:
        target = _strip_suffix(slug)
        return {k for k in self._fighters if _strip_suffix(k) == target}

    def _same_letters(self, slug: str) -> set[str]:
        """Family and given name swapped, or hyphenated differently ("Song Yadong")."""
        target = _letters(slug)
        return {k for k in self._fighters if _letters(k) == target}

    def _name_contains(self, slug: str) -> set[str]:
        """One name is the other plus extra parts ("Carlos Diego Ferreira" / "Diego Ferreira")."""
        wanted = set(_slug_tokens(slug))
        found = set()
        for key in self._fighters:
            have = set(_slug_tokens(key))
            small, large = sorted((wanted, have), key=len)
            if len(small) >= 2 and small <= large:
                found.add(key)
        return found

    def _close_spelling(self, slug: str) -> set[str]:
        stripped = _strip_suffix(slug)
        ranked = sorted(
            (
                (difflib.SequenceMatcher(None, stripped, _strip_suffix(key)).ratio(), key)
                for key in self._fighters
            ),
            reverse=True,
        )
        if not ranked or ranked[0][0] < _FUZZY_CUTOFF:
            return set()
        best = ranked[0][0]
        return {key for ratio, key in ranked if ratio >= best - _FUZZY_MARGIN}

    def _same_last_name(self, slug: str) -> set[str]:
        """A ring name or nickname instead of the given name ("Jacare Souza" / "Ronaldo Souza")."""
        tokens = _slug_tokens(slug)
        if not tokens:
            return set()
        return {
            key for key in self._fighters if (have := _slug_tokens(key)) and have[-1] == tokens[-1]
        }

    def resolve(self, name: str) -> str | None:
        slug = slugify(name)
        for step in (
            self._exact,
            self._without_suffix,
            self._same_letters,
            self._name_contains,
            self._close_spelling,
            self._same_last_name,
        ):
            candidates = step(slug)
            if len(candidates) == 1:
                return self._fighters[next(iter(candidates))]
            if len(candidates) > 1:
                return None
        return None


def resolve_awards(awards: BonusAwards, fights: Sequence[FightNames]) -> AwardResolution:
    index = EventIndex(fights)
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
