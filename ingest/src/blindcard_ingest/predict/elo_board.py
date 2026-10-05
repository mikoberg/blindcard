"""compute-elo: each fighter's Elo rating from past decisive results, for the spoiler leaderboard.

A rating is built from who beat whom, so the list reveals results. It therefore sits in the private
`fighter_elo` table and is served only by `elo_leaderboard` after an explicit click on a page that
says so (see CLAUDE.md). It uses the same tracker as the favourite of an upcoming bout.

Only fighters with enough fights are stored: a rating after two fights is mostly the starting value
plus luck. Whether a fighter is still active is decided when the list is served, against today.
"""

from __future__ import annotations

import logging

from blindcard_ingest.db.repository import Repository
from blindcard_ingest.predict.types import EloRow, FightOutcome
from blindcard_ingest.predict.winner import build_pairs

logger = logging.getLogger(__name__)

#: Fewest decisive fights before a fighter gets a rating on the board.
MIN_FIGHTS = 8


def build_board(outcomes: list[FightOutcome], *, min_fights: int = MIN_FIGHTS) -> list[EloRow]:
    """Every fighter with at least `min_fights` decisive fights, strongest first."""
    _, tracker = build_pairs(outcomes)
    rows = [
        EloRow(
            fighter_id=fighter,
            rating=round(rating, 1),
            fights=tracker.fights[fighter],
            last_fight=tracker.last_date[fighter],
        )
        for fighter, rating in tracker.ratings.items()
        if tracker.fights[fighter] >= min_fights and fighter in tracker.last_date
    ]
    rows.sort(key=lambda row: (-row.rating, row.fighter_id))
    return rows


def run_compute_elo(repo: Repository, *, dry_run: bool = False) -> list[EloRow]:
    outcomes = repo.winner_outcomes()
    rows = build_board(outcomes)
    # Logs hold counts only: never a name, a rating or a result.
    logger.info(
        "compute-elo%s: %d decisive fights, %d fighters on the board",
        " (dry run)" if dry_run else "",
        len(outcomes),
        len(rows),
    )
    if not dry_run:
        repo.set_fighter_elo(rows)
    return rows
