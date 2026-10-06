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
    #: How convincing the result was: a finish counts more, a split decision less. 1.0 = neutral.
    dominance: float = 1.0


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


#: Bumped when the way the Elo rating on the spoiler board is built changes.
#: 1 = K multiplier for finishes and split decisions; 2 = standard Elo with partial credit for split
#: and majority decisions (as Fight Matrix does), draws counted, no K multiplier.
ELO_VERSION = 2


@dataclass(frozen=True)
class EloFight:
    """A completed fight with a result Elo can use (a win, or a draw). RESULT DATA: it stays in the
    ingest process, like `FightOutcome`."""

    fight_id: str
    event_date: dt.date
    a_id: str
    b_id: str
    #: "win", "draw", or "none" (a no contest or anything else without a result Elo can use: the
    #: ratings do not move, but the fight still gets its pre-fight ratings)
    outcome: str
    #: Whether the fighter listed first won (meaningless for a draw).
    a_won: bool
    #: How a win was decided: "finish", "unanimous decision", "split decision",
    #: "majority decision" or "disqualification".
    how: str


@dataclass(frozen=True)
class EloRow:
    """One fighter on the Elo board. RESULT-DERIVED: stored privately, served only after a click."""

    fighter_id: str
    rating: float
    fights: int
    last_fight: dt.date
    #: The highest rating after any of their fights, and the date of that fight.
    peak: float
    peak_date: dt.date
    version: int = ELO_VERSION


@dataclass(frozen=True)
class EloStep:
    """One fight in a fighter's Elo history, with every number of the calculation. RESULT-DERIVED:
    stored privately and served only after a click on that fighter."""

    fighter_id: str
    seq: int
    fight_id: str
    fight_date: dt.date
    opponent_id: str
    #: What the fight counted as for this fighter: 1, 0, 0.5 (draw) or a partial credit.
    score: float
    #: "win" / "loss" / "draw" with how it was decided, e.g. "won by split decision".
    how: str
    rating_before: float
    opponent_rating: float
    expected: float
    k: float
    change: float
    rating_after: float


@dataclass(frozen=True)
class EloBefore:
    """A fighter's Elo going into a bout: the rating and how many fights it rests on."""

    rating: float
    fights: int


@dataclass(frozen=True)
class FightElo:
    """The Elo of both fighters going INTO a completed fight (public, like the record going in).

    Computed from earlier fights only, so it says nothing about this fight's own result. A side is
    None for a fighter with no earlier fight in our data."""

    fight_id: str
    a: EloBefore | None
    b: EloBefore | None


@dataclass(frozen=True)
class UpcomingElo:
    """The current Elo of both fighters of an announced bout (public, like the current record)."""

    bout_id: str
    a: EloBefore | None
    b: EloBefore | None


@dataclass(frozen=True)
class FighterNow:
    """A fighter's standing as of today, shown on their page: the record (w/l/d/nc) and the Elo.
    Public, of the same kind as the record and Elo on an announced bout; None = not reliable."""

    fighter_id: str
    record: dict[str, int] | None
    elo: EloBefore | None
    #: The highest rating they reached and the date of the fight that got them there (the
    #: earliest one at that rating); None when they have no rated fight.
    peak: tuple[float, dt.date] | None = None


@dataclass(frozen=True)
class RankBout:
    """A bout to give UFC ranks to: a stored fight or an announced bout (by id)."""

    key: str
    event_date: dt.date
    weight_class: str | None
    a_name: str
    b_name: str
