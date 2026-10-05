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
from typing import Any


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
    #: How a decided bout ended: "ko" (KO/TKO), "sub" (submission, injury stoppages excluded)
    #: or "other". Only ever read for LATER bouts of the same fighters.
    ended_by: str = "other"


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
    #: Each fighter's record in our history before the bout: (wins, losses, draws, no contests).
    #: Only bouts of the promotion count, so a fighter's earlier career elsewhere is missing.
    prior_records: tuple[tuple[int, int, int, int], tuple[int, int, int, int]] = (
        (0, 0, 0, 0),
        (0, 0, 0, 0),
    )
    #: True when the fighter's WHOLE promotion career is in our history (they debuted after
    #: UNBEATEN_RELIABLE_FROM), so the record above is complete and a "debut" is a real debut.
    complete_history: tuple[bool, bool] = (False, False)
    #: Earlier bouts of each fighter that ended in a KO/TKO or submission (either way round) ...
    prior_finishes: tuple[int, int] = (0, 0)
    #: ... and the earlier bouts each lost by KO/TKO.
    prior_ko_losses: tuple[int, int] = (0, 0)

    @property
    def finish_prone(self) -> float:
        """How often the two fighters' earlier bouts ended in a finish (0..1, shrunk to 0)."""
        return (
            sum(
                finishes / (fights + PRONE_PRIOR)
                for finishes, fights in zip(self.prior_finishes, self.prior_fights, strict=True)
            )
            / 2
        )

    @property
    def ko_prone(self) -> float:
        """The higher of the two fighters' share of earlier bouts lost by KO/TKO (0..1)."""
        return max(
            losses / (fights + PRONE_PRIOR)
            for losses, fights in zip(self.prior_ko_losses, self.prior_fights, strict=True)
        )


UNBEATEN_MIN_FIGHTS = 5
#: Pseudo-fights that pull a rate of earlier bouts towards 0 for fighters with little history.
PRONE_PRIOR = 4
#: Our history starts in 2001. Someone whose first stored bout is earlier than this much later
#: may have fought (and lost) before it, so "unbeaten" is only claimed for later debuts.
UNBEATEN_RELIABLE_FROM = dt.date(2003, 1, 1)


def career_json(context: CareerContext) -> dict[str, Any]:
    """The public shape stored in `fights.career` (a/b follow the fight's fighter_a / fighter_b).

    Only what the card shows: earlier meetings, each fighter's current win streak, and whether
    they are unbeaten. All of it comes from EARLIER bouts, so it says nothing about this one.
    """
    return {
        "meetings": context.prior_meetings,
        "a": _side(context, 0),
        "b": _side(context, 1),
    }


def _side(context: CareerContext, index: int) -> dict[str, Any]:
    side: dict[str, Any] = {
        "streak": context.win_streaks[index],
        "unbeaten": context.unbeaten[index],
    }
    if context.complete_history[index]:  # only a record we can stand behind
        wins, losses, draws, no_contests = context.prior_records[index]
        side.update({"w": wins, "l": losses, "d": draws, "nc": no_contests})
    return side


@dataclass
class _Record:
    wins: int = 0
    draws: int = 0
    no_contests: int = 0
    fights: int = 0
    losses: int = 0
    streak: int = 0
    headliners: int = 0
    first_seen: dt.date | None = None
    finishes: int = 0
    ko_losses: int = 0


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
                unbeaten=(_unbeaten(a), _unbeaten(b)),
                prior_records=(_tuple(a), _tuple(b)),
                complete_history=(_complete(a, day), _complete(b, day)),
                prior_finishes=(a.finishes, b.finishes),
                prior_ko_losses=(a.ko_losses, b.ko_losses),
            )
        # ... then let them count for later days.
        for bout in todays:
            if not bout.has_result:
                continue
            _apply(bout, records, meetings)
    return contexts


def _complete(record: _Record, day: dt.date) -> bool:
    """Our history holds this fighter's whole career in the promotion up to `day`."""
    if day < UNBEATEN_RELIABLE_FROM:
        return False
    return record.first_seen is None or record.first_seen >= UNBEATEN_RELIABLE_FROM


def _tuple(record: _Record) -> tuple[int, int, int, int]:
    return (record.wins, record.losses, record.draws, record.no_contests)


def _unbeaten(record: _Record) -> bool:
    return (
        record.fights >= UNBEATEN_MIN_FIGHTS
        and record.losses == 0
        and record.first_seen is not None
        and record.first_seen >= UNBEATEN_RELIABLE_FROM
    )


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
        if record.first_seen is None:
            record.first_seen = bout.event_date
        record.fights += 1
        record.headliners += headliner
        if bout.ended_by in ("ko", "sub"):
            record.finishes += 1
            if bout.ended_by == "ko" and bout.winner is not None and bout.winner != fighter:
                record.ko_losses += 1
        if bout.outcome == "no_contest":
            record.no_contests += 1
            continue
        if bout.winner == fighter:
            record.streak += 1
            record.wins += 1
        else:
            record.streak = 0
            if bout.winner is not None:  # a loss, not a draw
                record.losses += 1
            else:
                record.draws += 1
