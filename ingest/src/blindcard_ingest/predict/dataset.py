"""Pre-fight features, built strictly from what was public BEFORE each fight.

Fights are processed in date order and the history is updated only after every fight of a date
has been featurised, so a fight never sees itself or another fight of the same night. The same
`Tracker` that builds the training rows builds the features of an upcoming bout, so training and
prediction cannot drift apart.
"""

from __future__ import annotations

import datetime as dt
from collections import deque
from dataclasses import dataclass, field
from itertools import groupby

#: Pseudo-count pulling a fighter's average toward the division average (few fights, little say).
SHRINK = 3.0
#: Fights of a division needed before its own average is trusted over the global one.
DIVISION_MIN = 30
#: How many of the latest fights define the recent global level (the scale drifts a little).
RECENT_WINDOW = 500

FEATURES = (
    "avg_rating",  # average of the two fighters' shrunk averages
    "best_rating",
    "worst_rating",
    "recent_rating",  # same, from each fighter's last three fights
    "experience",  # fights of the less experienced fighter (capped): how much to trust the above
    "pair_synergy",  # both well above (or below) the average
    "main_event",
    "co_main",
    "title_fight",
    "womens",
    "division_level",  # how highly this division's fights rate on average
    "met_before",
    "global_drift",  # the recent average rating against the all-time one
    "avg_effect",  # the fighters' average rating beyond what their spot on the card explains
    "best_effect",
    "worst_effect",
    "card_depth",  # 0 at the top of the card, 1 at the bottom
    "depth_x_rating",  # fighter history counts most near the top of the card
)

#: Features that use no fighter history: the baseline "context only" model.
CONTEXT_FEATURES = (
    "main_event",
    "co_main",
    "title_fight",
    "womens",
    "division_level",
    "global_drift",
)


@dataclass(frozen=True)
class FightRow:
    """One rated fight, with public facts only (the star rating is the public one)."""

    fight_id: str
    event_date: dt.date
    position: int
    weight_class: str | None
    is_title_fight: bool
    a_id: str
    b_id: str
    stars: float


@dataclass(frozen=True)
class Example:
    row: FightRow
    x: tuple[float, ...]
    y: float


def _is_womens(weight_class: str | None) -> bool:
    return bool(weight_class) and weight_class.lower().startswith("women")  # type: ignore[union-attr]


def _slot(position: int, is_title_fight: bool) -> str:
    """The kind of spot on the card: it explains a lot of a fight's rating by itself."""
    if position == 1:
        return "main"
    if position == 2:
        return "co_main"
    return "title" if is_title_fight else "other"


@dataclass
class Tracker:
    """Running public history. `features()` reads it; `add()` extends it."""

    stars_by_fighter: dict[str, list[float]] = field(default_factory=dict)
    met: set[frozenset[str]] = field(default_factory=set)
    division: dict[str, list[float]] = field(default_factory=dict)  # name -> [sum, n]
    total: float = 0.0
    count: int = 0
    recent: deque[float] = field(default_factory=lambda: deque(maxlen=RECENT_WINDOW))
    slot: dict[str, list[float]] = field(default_factory=dict)  # slot -> [sum, n]
    effects_by_fighter: dict[str, list[float]] = field(default_factory=dict)

    def _slot_mean(self, slot: str) -> float:
        total, n = self.slot.get(slot, [0.0, 0.0])
        return total / n if n >= 20 else self._global_mean()

    def _global_mean(self) -> float:
        return self.total / self.count if self.count else 3.0

    def _division_mean(self, weight_class: str | None) -> float | None:
        if not weight_class:
            return None
        total, n = self.division.get(weight_class, [0.0, 0.0])
        return total / n if n >= DIVISION_MIN else None

    def _shrunk(self, stars: list[float], prior: float) -> float:
        return (sum(stars) + SHRINK * prior) / (len(stars) + SHRINK)

    def features(
        self,
        a_id: str | None,
        b_id: str | None,
        weight_class: str | None,
        position: int,
        is_title_fight: bool,
        card_size: int,
    ) -> tuple[float, ...]:
        """Features of a bout. A fighter that is unknown (a debut) has no history: they get the
        division average, and `experience` says how little that rests on."""
        global_mean = self._global_mean()
        division_mean = self._division_mean(weight_class)
        prior = division_mean if division_mean is not None else global_mean
        histories = [self.stars_by_fighter.get(f, []) if f else [] for f in (a_id, b_id)]
        shrunk = [self._shrunk(h, prior) for h in histories]
        recent = [self._shrunk(h[-3:], s) for h, s in zip(histories, shrunk, strict=True)]
        recent_global = sum(self.recent) / len(self.recent) if self.recent else global_mean
        met = bool(a_id and b_id and frozenset((a_id, b_id)) in self.met)
        depth = (position - 1) / (card_size - 1) if card_size > 1 else 0.0
        effects = [
            sum(h) / (len(h) + SHRINK)
            for h in (self.effects_by_fighter.get(f, []) if f else [] for f in (a_id, b_id))
        ]
        return (
            sum(shrunk) / 2,
            max(shrunk),
            min(shrunk),
            sum(recent) / 2,
            min(min(len(h) for h in histories), 8) / 8,
            (shrunk[0] - global_mean) * (shrunk[1] - global_mean),
            1.0 if position == 1 else 0.0,
            1.0 if position == 2 else 0.0,
            1.0 if is_title_fight else 0.0,
            1.0 if _is_womens(weight_class) else 0.0,
            (division_mean - global_mean) if division_mean is not None else 0.0,
            1.0 if met else 0.0,
            recent_global - global_mean,
            sum(effects) / 2,
            max(effects),
            min(effects),
            depth,
            depth * (sum(shrunk) / 2 - global_mean),
        )

    def add(self, row: FightRow) -> None:
        kind = _slot(row.position, row.is_title_fight)
        effect = row.stars - self._slot_mean(kind)
        for fighter in (row.a_id, row.b_id):
            self.stars_by_fighter.setdefault(fighter, []).append(row.stars)
            self.effects_by_fighter.setdefault(fighter, []).append(effect)
        entry_slot = self.slot.setdefault(kind, [0.0, 0.0])
        entry_slot[0] += row.stars
        entry_slot[1] += 1
        self.met.add(frozenset((row.a_id, row.b_id)))
        if row.weight_class:
            entry = self.division.setdefault(row.weight_class, [0.0, 0.0])
            entry[0] += row.stars
            entry[1] += 1
        self.total += row.stars
        self.count += 1
        self.recent.append(row.stars)


def build_examples(rows: list[FightRow]) -> tuple[list[Example], Tracker]:
    """Training examples in date order, and the tracker as it stands after the last fight."""
    tracker = Tracker()
    examples: list[Example] = []
    ordered = sorted(rows, key=lambda r: (r.event_date, r.position, r.fight_id))
    for _, group_iter in groupby(ordered, key=lambda r: r.event_date):
        group = list(group_iter)
        for row in group:
            x = tracker.features(
                row.a_id, row.b_id, row.weight_class, row.position, row.is_title_fight, len(group)
            )
            examples.append(Example(row=row, x=x, y=row.stars))
        for row in group:
            tracker.add(row)
    return examples, tracker
