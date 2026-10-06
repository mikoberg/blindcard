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
from dataclasses import dataclass, field
from itertools import groupby

from blindcard_ingest.db.repository import Repository
from blindcard_ingest.predict.types import (
    EloBefore,
    EloFight,
    EloRow,
    EloStep,
    FightElo,
    FighterNow,
    UpcomingBoutInput,
    UpcomingElo,
)

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


@dataclass
class Ledger:
    """Everything one pass over all fights produces."""

    ratings: dict[str, float] = field(default_factory=dict)
    #: How many rated fights each fighter has (no contests do not count).
    counts: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    steps: list[EloStep] = field(default_factory=list)
    #: fight id -> the two fighters' Elo going into it (None: no earlier fight).
    before: dict[str, tuple[EloBefore | None, EloBefore | None]] = field(default_factory=dict)


def build_ledger(fights: list[EloFight]) -> Ledger:
    """Final ratings, every step and the pre-fight ratings of every fight, in date order. Both
    fighters of a fight are updated from the ratings they had BEFORE it (a fighter fights at most
    once a night), so the order of fights within a night does not matter."""
    ledger = Ledger()
    ratings, count, steps = ledger.ratings, ledger.counts, ledger.steps
    ordered = sorted(fights, key=lambda f: (f.event_date, f.fight_id))
    for _, group in groupby(ordered, key=lambda f: f.event_date):
        for fight in group:
            a, b = fight.a_id, fight.b_id
            ra, rb = ratings.get(a, START), ratings.get(b, START)
            # What the two ratings were going in: this is what the cards show, and it is taken
            # before the fight is added, so it can say nothing about the fight itself.
            ledger.before[fight.fight_id] = (
                EloBefore(round(ra, 1), count[a]) if count[a] > 0 else None,
                EloBefore(round(rb, 1), count[b]) if count[b] > 0 else None,
            )
            if fight.outcome == "none":
                continue
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
    return ledger


def pre_fight_elo(ledger: Ledger) -> list[FightElo]:
    """The Elo going into every fight, for the public cards."""
    return [FightElo(fid, a, b) for fid, (a, b) in sorted(ledger.before.items())]


def fighters_now(
    ledger: Ledger,
    fighter_ids: list[str],
    records: dict[str, dict[str, int]],
) -> list[FighterNow]:
    """Every fighter's record and Elo as of today, for their page. A fighter with neither is left
    out (and loses any old values when stored)."""
    rows: list[FighterNow] = []
    for fighter in sorted(set(fighter_ids)):
        n = ledger.counts.get(fighter, 0)
        elo = EloBefore(round(ledger.ratings[fighter], 1), n) if n > 0 else None
        record = records.get(fighter)
        if elo is not None or record is not None:
            rows.append(FighterNow(fighter, record, elo))
    return rows


def current_elo(ledger: Ledger, bouts: list[UpcomingBoutInput]) -> list[UpcomingElo]:
    """The Elo of both fighters of every announced bout as of now."""

    def now(fighter: str | None) -> EloBefore | None:
        if fighter is None or ledger.counts.get(fighter, 0) == 0:
            return None
        return EloBefore(round(ledger.ratings[fighter], 1), ledger.counts[fighter])

    return [UpcomingElo(b.bout_id, now(b.a_id), now(b.b_id)) for b in bouts]


def build_board(
    fights: list[EloFight], *, min_fights: int = MIN_FIGHTS
) -> tuple[list[EloRow], list[EloStep]]:
    """The fighters with at least `min_fights` fights, strongest first, and the steps of exactly
    those fighters."""
    ledger = build_ledger(fights)
    ratings, steps = ledger.ratings, ledger.steps
    last: dict[str, EloStep] = {}
    best: dict[str, EloStep] = {}
    for step in steps:
        last[step.fighter_id] = step
        # The earliest fight at the highest rating counts as the peak.
        if step.fighter_id not in best or step.rating_after > best[step.fighter_id].rating_after:
            best[step.fighter_id] = step
    rows = [
        EloRow(
            fighter_id=fighter,
            rating=round(rating, 1),
            fights=last[fighter].seq,
            last_fight=last[fighter].fight_date,
            peak=best[fighter].rating_after,
            peak_date=best[fighter].fight_date,
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
    ledger = build_ledger(fights)
    before = pre_fight_elo(ledger)
    upcoming = current_elo(ledger, repo.upcoming_bouts_for_prediction())
    fighter_ids = [f for fight in fights for f in (fight.a_id, fight.b_id)]
    now = fighters_now(ledger, fighter_ids, repo.fighter_current_records(set(fighter_ids)))
    # Logs hold counts only: never a name, a rating or a result.
    logger.info(
        "compute-elo%s: %d fights, %d fighters on the board, %d steps, %d fights and %d bouts with"
        " ratings going in, %d fighters with a standing",
        " (dry run)" if dry_run else "",
        len(fights),
        len(rows),
        len(steps),
        sum(1 for f in before if f.a or f.b),
        sum(1 for u in upcoming if u.a or u.b),
        len(now),
    )
    if not dry_run:
        repo.set_fighter_elo(rows, steps)
        repo.set_fight_elo(before)
        repo.set_upcoming_elo(upcoming)
        repo.set_fighters_now(now)
        repo.refresh_fighter_tallies()
        repo.refresh_fighter_awards()
    return rows
