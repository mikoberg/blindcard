"""predict-picks: who is favoured in each announced bout (stored privately, served after a click).

The model is only used when a walk-forward test on past fights shows it clearly beats a coin; the
accuracy of that test is stored with every pick so the page can say how much to trust it. A bout is
left without a pick when neither fighter has earlier results.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from blindcard_ingest.db.repository import Repository
from blindcard_ingest.predict.types import PICK_VERSION, UpcomingBoutInput, UpcomingPick
from blindcard_ingest.predict.winner import (
    WinnerEvaluation,
    build_pairs,
    fit_winner_model,
    walk_forward,
)

logger = logging.getLogger(__name__)

TEST_FROM_YEAR = 2016


@dataclass
class PickReport:
    trained_on: int = 0
    bouts: int = 0
    evaluation: WinnerEvaluation | None = None
    picks: list[UpcomingPick] = field(default_factory=list)
    refused: bool = False


def make_picks(
    outcomes: list, bouts: list[UpcomingBoutInput], *, test_from_year: int = TEST_FROM_YEAR
) -> tuple[list[UpcomingPick], WinnerEvaluation, int]:
    examples, tracker = build_pairs(outcomes)
    evaluation = walk_forward(examples, test_from_year=test_from_year)
    if not evaluation.clearly_beats_a_coin():
        return [], evaluation, len(examples)
    model = fit_winner_model(examples)
    picks: list[UpcomingPick] = []
    for bout in bouts:
        known = sum(1 for f in (bout.a_id, bout.b_id) if f and tracker.experience(f) > 0)
        if known == 0:
            continue
        p_a = model.p_first(tracker.features(bout.a_id, bout.b_id, None))
        picks.append(
            UpcomingPick(
                bout_id=bout.bout_id,
                favoured="a" if p_a >= 0.5 else "b",
                probability=round(max(p_a, 1 - p_a), 3),
                basis="both" if known == 2 else "one",
                accuracy=round(evaluation.accuracy, 3),
                version=PICK_VERSION,
            )
        )
    return picks, evaluation, len(examples)


def run_predict_picks(repo: Repository, *, dry_run: bool = False) -> PickReport:
    bouts = repo.upcoming_bouts_for_prediction()
    report = PickReport(bouts=len(bouts))
    picks, evaluation, trained_on = make_picks(repo.winner_outcomes(), bouts)
    report.trained_on = trained_on
    report.evaluation = evaluation
    report.picks = picks
    report.refused = not evaluation.clearly_beats_a_coin()
    # Logs hold counts and the accuracy only, never a name or a pick.
    logger.info(
        "predict-picks%s: %d bouts, %d picks from %d decisive fights; %s%s",
        " (dry run)" if dry_run else "",
        len(bouts),
        len(picks),
        trained_on,
        evaluation.line(),
        " (REFUSED: does not clearly beat a coin)" if report.refused else "",
    )
    if not dry_run:
        repo.set_upcoming_picks(picks)
    return report
