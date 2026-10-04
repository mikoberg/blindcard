"""Turn labelled fights into feature rows for analysing and fitting scores.

Rows carry result-side data (method, round, bonuses): they stay in memory or in local files,
never in logs and never in anything committed.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from blindcard_ingest.db.repository import LabeledFight
from blindcard_ingest.scoring.features import (
    MethodKind,
    classify_method,
    compute_raw_features,
    scoring_problems,
)
from blindcard_ingest.sources.wikipedia.bonuses import (
    FIGHT_OF_THE_NIGHT,
    PERFORMANCE_OF_THE_NIGHT,
)


@dataclass(frozen=True)
class LabeledRow:
    fight_id: str
    event_source_id: str
    year: int
    card_position: int
    fights_on_card: int
    is_title_fight: bool
    method: MethodKind
    end_round: int
    raw: dict[str, float]
    fotn: bool
    potn: bool

    @property
    def finished(self) -> bool:
        return self.method in (MethodKind.KO_TKO, MethodKind.SUBMISSION)


def build_rows(fights: Sequence[LabeledFight]) -> tuple[list[LabeledRow], int]:
    """Feature rows for every scorable fight, plus how many could not be scored (skipped)."""
    rows: list[LabeledRow] = []
    skipped = 0
    for fight in fights:
        if scoring_problems(fight.input):
            skipped += 1
            continue
        rows.append(
            LabeledRow(
                fight_id=fight.fight_id,
                event_source_id=fight.event_source_id,
                year=fight.event_date.year,
                card_position=fight.card_position,
                fights_on_card=fight.fights_on_card,
                is_title_fight=fight.is_title_fight,
                method=classify_method(fight.input.method),
                end_round=fight.input.end_round,
                raw=compute_raw_features(fight.input),
                fotn=FIGHT_OF_THE_NIGHT in fight.bonuses,
                potn=PERFORMANCE_OF_THE_NIGHT in fight.bonuses,
            )
        )
    return rows, skipped
