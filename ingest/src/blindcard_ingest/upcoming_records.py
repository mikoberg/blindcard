"""The record a fighter brings into an upcoming bout.

It is the record going into their latest completed fight plus the result of that fight, plus the
bouts they fought after it that we only know from their Wikipedia table (other promotions). Nothing
is guessed: without a stored going-in record for that fight, or with a result we cannot read, there
is no record (a debut and an unmatched fighter have none either).
"""

from __future__ import annotations

from collections.abc import Mapping

#: What `fighter_bouts.result` holds, as the record's keys.
_RESULT_KEY = {"win": "w", "loss": "l", "draw": "d", "no_contest": "nc"}


def with_later_bouts(record: Mapping[str, int], later: Mapping[str, int]) -> dict[str, int]:
    """`record` plus the bouts fought after the latest fight we store: `later` maps a result
    (win / loss / draw / no_contest) to how many. Unknown results are never counted."""
    total = {k: int(record[k]) for k in ("w", "l", "d", "nc")}
    for result, count in later.items():
        key = _RESULT_KEY.get(result)
        if key is not None:
            total[key] += int(count)
    return total


def current_record(
    going_in: Mapping[str, int] | None, outcome: str, won: bool | None
) -> dict[str, int] | None:
    """`going_in`: {w, l, d, nc} before the fight. `outcome`: win / draw / no_contest.
    `won`: whether this fighter is the winner (None for a draw or no contest)."""
    if going_in is None or not all(k in going_in for k in ("w", "l", "d", "nc")):
        return None
    record = {k: int(going_in[k]) for k in ("w", "l", "d", "nc")}
    if outcome == "win":
        if won is None:
            return None
        record["w" if won else "l"] += 1
    elif outcome == "draw":
        record["d"] += 1
    elif outcome == "no_contest":
        record["nc"] += 1
    else:
        return None
    return record
