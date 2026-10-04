"""Builders for synthetic fights used across tests."""

from __future__ import annotations

from blindcard_ingest.models import (
    ParsedFight,
    ParsedFighter,
    ParsedResult,
    ParsedRound,
    order_fighters,
)
from blindcard_ingest.scoring.career import CareerContext
from blindcard_ingest.scoring.features import ScoringInput

A = "aaa111"
B = "bbb222"


def rnd(
    number: int,
    fighter: str,
    *,
    sig: int = 0,
    kd: int = 0,
    subs: int = 0,
    rev: int = 0,
    control: int = 0,
    total: int | None = None,
    td: int = 0,
) -> ParsedRound:
    return ParsedRound(
        round_number=number,
        fighter_source_id=fighter,
        knockdowns=kd,
        sig_strikes_landed=sig,
        sig_strikes_attempted=sig + 5,
        total_strikes_landed=sig if total is None else total,
        total_strikes_attempted=(sig if total is None else total) + 10,
        takedowns_landed=td,
        takedowns_attempted=td + 1,
        sub_attempts=subs,
        reversals=rev,
        control_seconds=control,
    )


def scoring_input(
    rounds: list[ParsedRound],
    *,
    method: str = "U-DEC",
    end_round: int = 3,
    end_time: int = 300,
    scheduled: int | None = 3,
    card_position: int | None = None,
    is_title_fight: bool = False,
    context: CareerContext | None = None,
) -> ScoringInput:
    return ScoringInput(
        scheduled_rounds=scheduled,
        method=method,
        end_round=end_round,
        end_time_seconds=end_time,
        rounds=rounds,
        card_position=card_position,
        is_title_fight=is_title_fight,
        context=context,
    )


def three_round_decision_rounds() -> list[ParsedRound]:
    """A leads R1 and R3, B leads R2. Totals: A 60 sig, B 50 sig; 90 s of control."""
    return [
        rnd(1, A, sig=20, control=60),
        rnd(1, B, sig=10),
        rnd(2, A, sig=10),
        rnd(2, B, sig=25, subs=1, control=30),
        rnd(3, A, sig=30, rev=1),
        rnd(3, B, sig=15),
    ]


def make_fight(
    *,
    listing_first: str = A,
    listing_second: str = B,
    winner: str | None = A,
    rounds: list[ParsedRound] | None = None,
    method: str = "U-DEC",
    end_round: int = 3,
    end_time: int = 300,
    scheduled: int | None = 3,
    source_id: str = "fight1",
    card_position: int = 1,
) -> ParsedFight:
    a, b = order_fighters(
        ParsedFighter(source_id=listing_first, name=f"Fighter {listing_first}"),
        ParsedFighter(source_id=listing_second, name=f"Fighter {listing_second}"),
    )
    return ParsedFight(
        source_id=source_id,
        card_position=card_position,
        fighter_a=a,
        fighter_b=b,
        scheduled_rounds=scheduled,
        result=ParsedResult(
            outcome="win" if winner else "draw",
            winner_source_id=winner,
            method=method,
            end_round=end_round,
            end_time_seconds=end_time,
        ),
        rounds=rounds if rounds is not None else three_round_decision_rounds(),
    )
