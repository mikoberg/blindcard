"""Plain data passed between the repository and the prediction pipeline."""

from __future__ import annotations

from dataclasses import dataclass

#: Bumped when the features or the fitting change.
MODEL_VERSION = 1


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
