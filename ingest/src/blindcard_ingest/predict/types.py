"""Plain data passed between the repository and the prediction pipelines."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

#: Bumped when the features or the fitting of the expected rating change.
MODEL_VERSION = 1
#: Same for the favourite model.
PICK_VERSION = 1


@dataclass(frozen=True)
class UpcomingBoutInput:
    bout_id: str
    position: int
    card_size: int
    weight_class: str | None
    is_title_fight: bool
    a_id: str | None
    b_id: str | None


@dataclass(frozen=True)
class Reason:
    #: Plain words for a group of features, e.g. "Spot on the card".
    label: str
    #: Signed contribution to the expected rating, in stars, against an average fight.
    amount: float


@dataclass(frozen=True)
class UpcomingPrediction:
    bout_id: str
    stars: float
    #: "both", "one" or "none": how many of the two fighters have earlier rated fights to go on.
    basis: str
    reasons: tuple[Reason, ...]
    version: int = MODEL_VERSION


@dataclass(frozen=True)
class FightOutcome:
    """A completed fight with a decisive result. RESULT DATA: never leaves the ingest process."""

    fight_id: str
    event_date: dt.date
    a_id: str
    b_id: str
    a_won: bool


@dataclass(frozen=True)
class UpcomingPick:
    """Who is favoured in an upcoming bout. Stored privately and served only after a click."""

    bout_id: str
    #: "a" or "b": the fighter listed first or second on the bout.
    favoured: str
    #: Chance of the favoured side, between 0.5 and 1.
    probability: float
    #: "both" or "one": how many of the two fighters have earlier results to go on.
    basis: str
    #: How often the favoured side won in a walk-forward test on past fights.
    accuracy: float
    version: int = PICK_VERSION
