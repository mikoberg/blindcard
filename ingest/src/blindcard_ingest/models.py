"""Parsed domain models shared by the sources, the repository and the scorer."""

from __future__ import annotations

import datetime as dt
import re
import unicodedata
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SECONDS_PER_ROUND = 300

Outcome = Literal["win", "draw", "no_contest"]


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class ParsedFighter(_Frozen):
    source_id: str = Field(min_length=1)
    name: str = Field(min_length=1)


def order_fighters(
    first: ParsedFighter, second: ParsedFighter
) -> tuple[ParsedFighter, ParsedFighter]:
    """Return (fighter_a, fighter_b) by a rule that is independent of the result.

    The first-listed fighter wins far more often than the second (~63% vs ~35% in the source
    data), so listing order must never decide who is `a`.
    Rule: `a` has the smaller `source_id` (compared by code point, like Postgres `collate "C"`).
    """
    if first.source_id == second.source_id:
        raise ValueError(f"A fight needs two different fighters, got {first.source_id!r} twice")
    return (first, second) if first.source_id < second.source_id else (second, first)


class ParsedRound(_Frozen):
    """One fighter's stats for one round."""

    round_number: int = Field(ge=1)
    fighter_source_id: str = Field(min_length=1)
    knockdowns: int = Field(ge=0, default=0)
    sig_strikes_landed: int = Field(ge=0, default=0)
    sig_strikes_attempted: int = Field(ge=0, default=0)
    total_strikes_landed: int = Field(ge=0, default=0)
    total_strikes_attempted: int = Field(ge=0, default=0)
    takedowns_landed: int = Field(ge=0, default=0)
    takedowns_attempted: int = Field(ge=0, default=0)
    sub_attempts: int = Field(ge=0, default=0)
    reversals: int = Field(ge=0, default=0)
    control_seconds: int = Field(ge=0, default=0)

    @model_validator(mode="after")
    def _landed_not_above_attempted(self) -> ParsedRound:
        if self.sig_strikes_landed > self.sig_strikes_attempted:
            raise ValueError("significant strikes landed exceed attempted")
        if self.total_strikes_landed > self.total_strikes_attempted:
            raise ValueError("total strikes landed exceed attempted")
        if self.takedowns_landed > self.takedowns_attempted:
            raise ValueError("takedowns landed exceed attempted")
        return self


class ParsedResult(_Frozen):
    """Result-side data. Private: only ever served through the reveal path."""

    outcome: Outcome
    winner_source_id: str | None = None
    method: str = Field(min_length=1)
    method_detail: str | None = None
    end_round: int = Field(ge=1)
    end_time_seconds: int = Field(ge=0)
    scorecards: list[str] = Field(default_factory=list)
    bonuses: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _winner_matches_outcome(self) -> ParsedResult:
        if (self.outcome == "win") != (self.winner_source_id is not None):
            raise ValueError("a winner is set if and only if the outcome is 'win'")
        return self


class ParsedFight(_Frozen):
    source_id: str = Field(min_length=1)
    card_position: int = Field(ge=1)  # 1 = main event
    fighter_a: ParsedFighter
    fighter_b: ParsedFighter
    weight_class: str | None = None
    is_title_fight: bool = False
    scheduled_rounds: int | None = Field(default=None, ge=1, le=5)
    result: ParsedResult | None = None
    rounds: list[ParsedRound] = Field(default_factory=list)

    @model_validator(mode="after")
    def _fighters_ordered_by_rule(self) -> ParsedFight:
        a, b = order_fighters(self.fighter_a, self.fighter_b)
        if (a, b) != (self.fighter_a, self.fighter_b):
            raise ValueError("fighter_a must have the smaller source_id (see order_fighters)")
        return self

    def completeness_problems(self) -> list[str]:
        """Why this fight cannot be stored as complete; empty when it is complete.

        Complete = a result AND consistent round data (rounds 1..end_round, both fighters each).
        """
        # Messages go to logs that may be public: they must not hold round numbers (the expected
        # range is the finishing round), strikes or other result values.
        problems: list[str] = []
        if self.result is None:
            problems.append("no result")
        if not self.rounds:
            problems.append("no round data")
        if problems:
            return problems

        fighter_ids = {self.fighter_a.source_id, self.fighter_b.source_id}
        seen: dict[int, set[str]] = {}
        for stats in self.rounds:
            if stats.fighter_source_id not in fighter_ids:
                problems.append("round stats for an unknown fighter")
            seen.setdefault(stats.round_number, set()).add(stats.fighter_source_id)

        assert self.result is not None
        if set(seen) != set(range(1, self.result.end_round + 1)):
            problems.append("round data does not cover every round")
        if any(who != fighter_ids for who in seen.values()):
            problems.append("a round lacks stats for one fighter")
        winner = self.result.winner_source_id
        if winner is not None and winner not in fighter_ids:
            problems.append("winner is not one of the fighters")
        return problems


class ParsedEvent(_Frozen):
    source_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    event_date: dt.date
    location: str | None = None


class EventBundle(_Frozen):
    event: ParsedEvent
    fights: list[ParsedFight]


_SLUG_STRIP = re.compile(r"[^a-z0-9]+")


def slugify(text: str) -> str:
    """ASCII, lowercase, hyphen-separated. Never empty."""
    folded = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    slug = _SLUG_STRIP.sub("-", folded.lower()).strip("-")
    return slug or "untitled"
