"""Who is favoured in an upcoming bout: Elo ratings from past decisive results, plus experience.

This is the one place that learns from results, so it is kept strictly apart from the expected
rating: its output is stored in a private table and only served after a click. Like the expected
rating it is pre-fight, symmetric in the two fighters (the a/b order of a bout carries no
information) and built strictly from fights BEFORE a date.
"""

from __future__ import annotations

import datetime as dt
import math
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass, field
from itertools import groupby

from blindcard_ingest.fit.stats import logistic_fit
from blindcard_ingest.predict.types import FightOutcome

START = 1500.0
#: Experience-dependent step size: newcomers move fast, veterans slowly.
K_BASE = 20.0
K_NEW = 40.0
K_HALF_LIFE = 3.0
L2 = 5.0


@dataclass
class EloTracker:
    ratings: dict[str, float] = field(default_factory=dict)
    fights: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    wins: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    form: dict[str, list[int]] = field(default_factory=lambda: defaultdict(list))
    last_date: dict[str, dt.date] = field(default_factory=dict)

    def rating(self, fighter: str | None) -> float:
        return self.ratings.get(fighter, START) if fighter else START

    def experience(self, fighter: str | None) -> int:
        return self.fights.get(fighter, 0) if fighter else 0

    def _win_rate(self, fighter: str | None) -> float:
        """Win share, pulled toward one half by two phantom fights each way."""
        if not fighter:
            return 0.5
        return (self.wins.get(fighter, 0) + 2) / (self.fights.get(fighter, 0) + 4)

    def _form(self, fighter: str | None) -> float:
        """Win share of the last three fights, pulled toward one half."""
        recent = self.form.get(fighter, [])[-3:] if fighter else []
        return (sum(recent) + 1) / (len(recent) + 2)

    def _layoff(self, fighter: str | None, today: dt.date | None) -> float:
        """Years since the last fight, capped at two; a debut counts as none."""
        last = self.last_date.get(fighter) if fighter else None
        if last is None or today is None:
            return 0.0
        return min((today - last).days, 730) / 365.0

    def features(
        self, a: str | None, b: str | None, today: dt.date | None = None
    ) -> tuple[float, ...]:
        """a minus b: Elo difference (400-point units), log experience, win share, recent form
        and time since the last fight."""
        return (
            (self.rating(a) - self.rating(b)) / 400.0,
            math.log1p(self.experience(a)) - math.log1p(self.experience(b)),
            self._win_rate(a) - self._win_rate(b),
            self._form(a) - self._form(b),
            self._layoff(a, today) - self._layoff(b, today),
        )

    def _step(self, fighter: str) -> float:
        return K_BASE + K_NEW / (1 + self.fights[fighter] / K_HALF_LIFE)

    def add(self, outcome: FightOutcome) -> None:
        a, b = outcome.a_id, outcome.b_id
        expected_a = 1 / (1 + 10 ** ((self.rating(b) - self.rating(a)) / 400))
        score_a = 1.0 if outcome.a_won else 0.0
        ka, kb = self._step(a), self._step(b)
        self.ratings[a] = self.rating(a) + ka * (score_a - expected_a)
        self.ratings[b] = self.rating(b) + kb * ((1 - score_a) - (1 - expected_a))
        self.fights[a] += 1
        self.fights[b] += 1
        self.wins[a] += int(outcome.a_won)
        self.wins[b] += int(not outcome.a_won)
        self.form[a].append(int(outcome.a_won))
        self.form[b].append(int(not outcome.a_won))
        self.last_date[a] = self.last_date[b] = outcome.event_date


@dataclass(frozen=True)
class PairExample:
    outcome: FightOutcome
    x: tuple[float, ...]
    y: int


def build_pairs(outcomes: Sequence[FightOutcome]) -> tuple[list[PairExample], EloTracker]:
    """Examples in date order and the tracker after the last fight. A fight never sees itself or
    another fight of the same night."""
    tracker = EloTracker()
    examples: list[PairExample] = []
    ordered = sorted(outcomes, key=lambda o: (o.event_date, o.fight_id))
    for _, group_iter in groupby(ordered, key=lambda o: o.event_date):
        group = list(group_iter)
        for o in group:
            examples.append(
                PairExample(o, tracker.features(o.a_id, o.b_id, o.event_date), 1 if o.a_won else 0)
            )
        for o in group:
            tracker.add(o)
    return examples, tracker


@dataclass(frozen=True)
class WinnerModel:
    intercept: float
    coefficients: tuple[float, ...]

    def p_first(self, x: Sequence[float]) -> float:
        z = self.intercept + sum(c * v for c, v in zip(self.coefficients, x, strict=True))
        return 1 / (1 + math.exp(-z))


def fit_winner_model(examples: Sequence[PairExample], *, l2: float = L2) -> WinnerModel:
    """Logistic on both orientations of every fight: the model cannot learn the a/b order."""
    rows: list[list[float]] = []
    labels: list[int] = []
    for e in examples:
        rows.append(list(e.x))
        labels.append(e.y)
        rows.append([-v for v in e.x])
        labels.append(1 - e.y)
    fit = logistic_fit(rows, labels, l2=l2)
    return WinnerModel(fit.intercept, fit.coefficients)


@dataclass(frozen=True)
class WinnerEvaluation:
    n: int
    accuracy: float
    log_loss: float
    #: Baselines on the same fights.
    accuracy_higher_elo: float
    accuracy_more_experienced: float
    #: Accuracy where the model was at least 65% sure, and how often that happened.
    confident_accuracy: float
    confident_share: float

    @property
    def standard_error(self) -> float:
        return math.sqrt(0.25 / self.n) if self.n else 1.0

    def clearly_beats_a_coin(self) -> bool:
        return self.n >= 500 and self.accuracy - 2 * self.standard_error > 0.5

    def line(self) -> str:
        return (
            f"n={self.n} accuracy={self.accuracy:.3f} log_loss={self.log_loss:.3f} (coin 0.693) | "
            f"higher Elo {self.accuracy_higher_elo:.3f}, more experienced "
            f"{self.accuracy_more_experienced:.3f} | sure>=65%: {self.confident_accuracy:.3f} "
            f"on {self.confident_share:.0%}"
        )


def walk_forward(examples: Sequence[PairExample], *, test_from_year: int) -> WinnerEvaluation:
    years = sorted(
        {e.outcome.event_date.year for e in examples if e.outcome.event_date.year >= test_from_year}
    )
    hits = elo_hits = exp_hits = n = 0
    confident = confident_hits = 0
    loss = 0.0
    for year in years:
        train = [e for e in examples if e.outcome.event_date.year < year]
        test = [e for e in examples if e.outcome.event_date.year == year]
        if len(train) < 500 or not test:
            continue
        model = fit_winner_model(train)
        for e in test:
            p = model.p_first(e.x)
            n += 1
            hits += int((p >= 0.5) == bool(e.y))
            loss -= math.log(max(1e-9, p if e.y else 1 - p))
            elo_hits += int((e.x[0] >= 0) == bool(e.y)) if e.x[0] != 0 else 0
            exp_hits += int((e.x[1] >= 0) == bool(e.y)) if e.x[1] != 0 else 0
            if max(p, 1 - p) >= 0.65:
                confident += 1
                confident_hits += int((p >= 0.5) == bool(e.y))
    if n == 0:
        return WinnerEvaluation(0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    return WinnerEvaluation(
        n=n,
        accuracy=hits / n,
        log_loss=loss / n,
        accuracy_higher_elo=elo_hits / n,
        accuracy_more_experienced=exp_hits / n,
        confident_accuracy=confident_hits / confident if confident else 0.0,
        confident_share=confident / n,
    )
