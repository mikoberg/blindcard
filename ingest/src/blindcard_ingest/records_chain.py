"""Fill a missing going-in record from the same fighter's neighbouring fights in our own data.

The record a fighter had going into a fight normally comes from their Wikipedia or Sherdog page.
When that page is not (yet) written up to the fight, or the opponent's name is spelled
differently there, the record of that one fight stays empty although the fighter's record
going into the fight before or after it is known. Then it follows from the result in between:

* the record before fight k is the record before fight k-1 plus the result of k-1, or
* the record before fight k+1 minus the result of k.

This only holds when the fighter had no other fight in between (a bout outside the UFC would change
the record without being in our data). So a gap is bridged only when no known outside bout falls
inside it and the two fights are at most `MAX_GAP_DAYS` apart; otherwise the record stays empty and
the card says nothing. Never a guess. Nothing here reads a result into a public place: only the
resulting going-in record is stored, exactly as for any other fight.
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

#: Two fights further apart than this are not bridged unless the fighter's career is known to hold
#: no outside bout in between (it is not checked beyond this, because an unknown career is unknown).
MAX_GAP_DAYS = 540

_KEYS = ("w", "l", "d", "nc")


@dataclass(frozen=True)
class ChainFight:
    """A stored fight with both fighters, the records stored now and how it ended."""

    fight_source_id: str
    event_date: dt.date
    a_source_id: str
    b_source_id: str
    #: `fights.records` as stored now: {"a": {"w": 1, "l": 0, "d": 0, "nc": 0}, "b": {...}} or None.
    stored_records: Mapping[str, Any] | None
    #: "win" (the winner is `winner`), "draw", "no_contest" or None when unknown.
    outcome: str | None
    #: "a", "b" or None.
    winner: str | None


@dataclass
class _Slot:
    fight_source_id: str
    side: str
    date: dt.date
    record: dict[str, int] | None
    delta: dict[str, int] | None  # what this fight adds to the record, None when unknown


def _clean(record: Any) -> dict[str, int] | None:
    if not isinstance(record, Mapping):
        return None
    try:
        return {key: int(record[key]) for key in _KEYS}
    except (KeyError, TypeError, ValueError):
        return None


def _delta(fight: ChainFight, side: str) -> dict[str, int] | None:
    if fight.outcome == "draw":
        return {"w": 0, "l": 0, "d": 1, "nc": 0}
    if fight.outcome == "no_contest":
        return {"w": 0, "l": 0, "d": 0, "nc": 1}
    if fight.outcome == "win" and fight.winner in ("a", "b"):
        won = fight.winner == side
        return {"w": int(won), "l": int(not won), "d": 0, "nc": 0}
    return None


def _bridgeable(first: dt.date, second: dt.date, outside: Sequence[dt.date] | None) -> bool:
    if outside and any(first < day < second for day in outside):
        return False
    return (second - first).days <= MAX_GAP_DAYS


def chain_records(
    fights: Sequence[ChainFight],
    outside_bouts: Mapping[str, Sequence[dt.date]] | None = None,
) -> dict[str, dict[str, dict[str, int]]]:
    """`{fight_source_id: {side: record}}` for the sides that have none stored but follow from a
    neighbouring fight. `outside_bouts` maps a fighter's source id to the dates of their bouts that
    are not in our data."""
    outside_bouts = outside_bouts or {}
    timelines: dict[str, list[_Slot]] = defaultdict(list)
    for fight in fights:
        stored = fight.stored_records or {}
        for side, fighter in (("a", fight.a_source_id), ("b", fight.b_source_id)):
            timelines[fighter].append(
                _Slot(
                    fight.fight_source_id,
                    side,
                    fight.event_date,
                    _clean(stored.get(side)),
                    _delta(fight, side),
                )
            )
    filled: dict[str, dict[str, dict[str, int]]] = defaultdict(dict)
    for fighter, slots in timelines.items():
        slots.sort(key=lambda s: (s.date, s.fight_source_id))
        outside = outside_bouts.get(fighter)
        changed = True
        while changed:
            changed = False
            for i, slot in enumerate(slots):
                if slot.record is not None:
                    continue
                before = slots[i - 1] if i > 0 else None
                after = slots[i + 1] if i + 1 < len(slots) else None
                if (
                    before is not None
                    and before.record is not None
                    and before.delta is not None
                    and _bridgeable(before.date, slot.date, outside)
                ):
                    slot.record = {k: before.record[k] + before.delta[k] for k in _KEYS}
                elif (
                    after is not None
                    and after.record is not None
                    and slot.delta is not None
                    and _bridgeable(slot.date, after.date, outside)
                ):
                    candidate = {k: after.record[k] - slot.delta[k] for k in _KEYS}
                    if min(candidate.values()) < 0:
                        continue  # the numbers do not fit: leave it empty
                    slot.record = candidate
                else:
                    continue
                filled[slot.fight_source_id][slot.side] = slot.record
                changed = True
    return dict(filled)
