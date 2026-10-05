"""compute-elo: each fighter's Elo rating and the full calculation behind it, for the spoiler page.

This is standard Elo: the expected score of A against B is 1 / (1 + 10^((Rb - Ra) / 400)) and a
rating moves by K * (score - expected). Everyone starts at 1500. Two choices that the standard
leaves open are made the way the established systems make them:

* K shrinks with experience, like FIDE's higher K for new players: K = 30 + 60 / (1 + fights / 3),
  so a debutant moves by 90 per full point and a veteran of 30 fights by about 35.
* The score of a win depends on how it was decided, like Fight Matrix (whose published values are
  used): a split decision is worth 0.667 and a majority decision 0.833 to the winner, any other
  win 1, and a draw 0.5 each. There is no multiplier on K.

Walk-forward on 2016-2026 (5136 fights), predicting each fight before it was added: log loss 0.6772
against 0.6814 for plain win/loss Elo with the same K scale and 0.6790 for the earlier multiplier
variant (docs/PREDICTIONS.md has the table).

A rating is built from who beat whom, so the list and its history reveal results. They sit in
private tables and are served only after explicit clicks (see CLAUDE.md). Only fighters with enough
fights are stored; whether one is still active is decided when the list is served, against today.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from itertools import groupby

from blindcard_ingest.db.repository import Repository
from blindcard_ingest.predict.types import EloFight, EloRow, EloStep

logger = logging.getLogger(__name__)

START = 1500.0
#: K = K_BASE + K_NEW / (1 + fights / K_HALF_LIFE): the step size of a fighter with `fights` fights.
K_BASE = 30.0
K_NEW = 60.0
K_HALF_LIFE = 3.0
#: What a win counts as, by how it was decided (Fight Matrix's published values). Others count 1.
WIN_CREDIT = {"split decision": 0.667, "majority decision": 0.833}
#: Fewest fights before a fighter gets a rating on the board.
MIN_FIGHTS = 8


def step_size(fights_so_far: int) -> float:
    return K_BASE + K_NEW / (1 + fights_so_far / K_HALF_LIFE)


def expected_score(rating: float, opponent: float) -> float:
    return 1 / (1 + 10 ** ((opponent - rating) / 400))


def score_of(fight: EloFight) -> float:
    """What the fighter listed first scored: 1 / 0 for a win or loss, partial for a close
    decision."""
    if fight.outcome == "draw":
        return 0.5
    credit = WIN_CREDIT.get(fight.how, 1.0)
    return credit if fight.a_won else 1.0 - credit


def _how(fight: EloFight, *, won: bool) -> str:
    if fight.outcome == "draw":
        return "draw"
    return f"{'won' if won else 'lost'} by {fight.how}"


def build_ledger(fights: list[EloFight]) -> tuple[dict[str, float], list[EloStep]]:
    """Final ratings and every step, in date order. Both fighters of a fight are updated from the
    ratings they had BEFORE it (and a fighter fights at most once a night), so the order of fights
    within a night does not matter."""
    ratings: dict[str, float] = {}
    count: dict[str, int] = defaultdict(int)
    steps: list[EloStep] = []
    ordered = sorted(fights, key=lambda f: (f.event_date, f.fight_id))
    for _, group in groupby(ordered, key=lambda f: f.event_date):
        for fight in group:
            a, b = fight.a_id, fight.b_id
            ra, rb = ratings.get(a, START), ratings.get(b, START)
            score_a = score_of(fight)
            ea = expected_score(ra, rb)
            ka, kb = step_size(count[a]), step_size(count[b])
            change_a = ka * (score_a - ea)
            change_b = kb * ((1.0 - score_a) - (1.0 - ea))
            for fighter, opp, before, opp_before, score, expected, k, change, won in (
                (a, b, ra, rb, score_a, ea, ka, change_a, fight.a_won),
                (b, a, rb, ra, 1.0 - score_a, 1.0 - ea, kb, change_b, not fight.a_won),
            ):
                steps.append(
                    EloStep(
                        fighter_id=fighter,
                        seq=count[fighter] + 1,
                        fight_id=fight.fight_id,
                        fight_date=fight.event_date,
                        opponent_id=opp,
                        score=round(score, 3),
                        how=_how(fight, won=won),
                        rating_before=round(before, 1),
                        opponent_rating=round(opp_before, 1),
                        expected=round(expected, 4),
                        k=round(k, 1),
                        change=round(change, 1),
                        rating_after=round(before + change, 1),
                    )
                )
            ratings[a], ratings[b] = ra + change_a, rb + change_b
            count[a] += 1
            count[b] += 1
    return ratings, steps


def build_board(
    fights: list[EloFight], *, min_fights: int = MIN_FIGHTS
) -> tuple[list[EloRow], list[EloStep]]:
    """The fighters with at least `min_fights` fights, strongest first, and the steps of exactly
    those fighters."""
    ratings, steps = build_ledger(fights)
    last: dict[str, EloStep] = {}
    for step in steps:
        last[step.fighter_id] = step
    rows = [
        EloRow(
            fighter_id=fighter,
            rating=round(rating, 1),
            fights=last[fighter].seq,
            last_fight=last[fighter].fight_date,
        )
        for fighter, rating in ratings.items()
        if last[fighter].seq >= min_fights
    ]
    rows.sort(key=lambda row: (-row.rating, row.fighter_id))
    keep = {row.fighter_id for row in rows}
    return rows, [s for s in steps if s.fighter_id in keep]


def run_compute_elo(repo: Repository, *, dry_run: bool = False) -> list[EloRow]:
    fights = repo.elo_fights()
    rows, steps = build_board(fights)
    # Logs hold counts only: never a name, a rating or a result.
    logger.info(
        "compute-elo%s: %d fights, %d fighters on the board, %d steps",
        " (dry run)" if dry_run else "",
        len(fights),
        len(rows),
        len(steps),
    )
    if not dry_run:
        repo.set_fighter_elo(rows, steps)
    return rows
