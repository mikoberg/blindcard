"""What was known about the two fighters before a bout: their UFC history up to that day.

All of it is a pre-fight fact (earlier fights, never the bout itself), so it can be shown and
used in a score without saying anything about how the bout went. Only fights BEFORE the bout's
event date count: bouts of the same event never see each other.

Fighters are identified by the source's stable fighter id. The record is the UFC record only.
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class HistoryBout:
    """One bout as the history needs it. `winner` is None for a draw, no contest or unknown."""

    fight_id: str
    event_date: dt.date
    card_position: int
    is_title_fight: bool
    fighter_a: str
    fighter_b: str
    winner: str | None
    #: True when the bout has a result: only decided bouts count as history for later ones.
    has_result: bool = True
    #: "no_contest" bouts neither add a win nor break a streak.
    outcome: str = "win"


@dataclass(frozen=True)
class CareerContext:
    """The two fighters' history before the bout (order of the pair is not meaningful)."""

    prior_meetings: int
    win_streaks: tuple[int, int]
    prior_fights: tuple[int, int]
    #: Earlier main events and title fights (a measure of how prominent the fighter is).
    prior_headliners: tuple[int, int]
    #: Fights without a loss in the UFC, with at least `UNBEATEN_MIN_FIGHTS` of them.
    unbeaten: tuple[bool, bool]


UNBEATEN_MIN_FIGHTS = 5


@dataclass
class _Record:
    fights: int = 0
    losses: int = 0
    streak: int = 0
    headliners: int = 0


def career_contexts(bouts: Sequence[HistoryBout]) -> dict[str, CareerContext]:
    """The context of every bout, from the decided bouts of strictly earlier dates."""
    records: dict[str, _Record] = defaultdict(_Record)
    meetings: dict[frozenset[str], int] = defaultdict(int)
    contexts: dict[str, CareerContext] = {}

    by_date: dict[dt.date, list[HistoryBout]] = defaultdict(list)
    for bout in bouts:
        by_date[bout.event_date].append(bout)

    for day in sorted(by_date):
        todays = by_date[day]
        # First read the context of the day's bouts (history before today) ...
        for bout in todays:
            a, b = records[bout.fighter_a], records[bout.fighter_b]
            contexts[bout.fight_id] = CareerContext(
                prior_meetings=meetings[frozenset((bout.fighter_a, bout.fighter_b))],
                win_streaks=(a.streak, b.streak),
                prior_fights=(a.fights, b.fights),
                prior_headliners=(a.headliners, b.headliners),
                unbeaten=(
                    a.fights >= UNBEATEN_MIN_FIGHTS and a.losses == 0,
                    b.fights >= UNBEATEN_MIN_FIGHTS and b.losses == 0,
                ),
            )
        # ... then let them count for later days.
        for bout in todays:
            if not bout.has_result:
                continue
            _apply(bout, records, meetings)
    return contexts


def _apply(
    bout: HistoryBout,
    records: dict[str, _Record],
    meetings: dict[frozenset[str], int],
) -> None:
    pair = (bout.fighter_a, bout.fighter_b)
    meetings[frozenset(pair)] += 1
    headliner = bout.card_position == 1 or bout.is_title_fight
    for fighter in pair:
        record = records[fighter]
        record.fights += 1
        record.headliners += headliner
        if bout.outcome == "no_contest":
            continue
        if bout.winner == fighter:
            record.streak += 1
        else:
            record.streak = 0
            if bout.winner is not None:  # a loss, not a draw
                record.losses += 1
