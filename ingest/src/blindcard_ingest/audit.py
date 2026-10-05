"""audit-scores: does the latest data still look like the scores say it should?

A five-star classic is the top ~1% of fights, so a card of twelve fights should rarely have more
than one. This check compares the recent past with the long-run rate and says when a stretch is
too unlikely to be luck, so a drifting score is noticed by the pipeline and not by a visitor.

It looks at the rate of classics (5.0) and of fights of 4.5 and up, in the latest runs of events
and per year. The probabilities are plain binomial tails against the long-run rate: "how often
would a run like this happen by chance". Flags are information for a human, never an automatic fix.
"""

from __future__ import annotations

import datetime as dt
import math
from collections.abc import Sequence
from dataclasses import dataclass, field

#: A run this unlikely (by chance) is worth a look / is an alert.
NOTE_BELOW = 0.05
ALERT_BELOW = 0.01
#: Runs of consecutive events checked at the end of the data.
WINDOWS = (6, 12)
#: Years checked at the end of the data.
YEARS = 3
#: Each check needs at least this many fights to say anything.
MIN_FIGHTS = 60


@dataclass(frozen=True)
class ScoredEvent:
    event_date: dt.date
    name: str
    #: The star ratings of the event's fights (public ones).
    stars: tuple[float, ...]


def binomial_tail(k: int, n: int, p: float) -> float:
    """P(X >= k) for X ~ Binomial(n, p): how likely k or more by chance."""
    if k <= 0:
        return 1.0
    if k > n:
        return 0.0
    below = sum(math.comb(n, i) * p**i * (1 - p) ** (n - i) for i in range(k))
    return max(0.0, 1.0 - below)


@dataclass(frozen=True)
class Check:
    what: str
    fights: int
    hits: int
    expected: float
    #: Chance of this many or more by luck alone.
    p_value: float

    @property
    def level(self) -> str:
        if self.p_value < ALERT_BELOW:
            return "ALERT"
        if self.p_value < NOTE_BELOW:
            return "note"
        return "ok"

    def line(self) -> str:
        return (
            f"{self.level:5s} {self.what}: {self.hits} of {self.fights} fights "
            f"(expected {self.expected:.1f}), chance by luck {self.p_value:.1%}"
        )


@dataclass
class AuditReport:
    fights: int = 0
    classic_rate: float = 0.0
    high_rate: float = 0.0
    checks: list[Check] = field(default_factory=list)

    @property
    def alerts(self) -> list[Check]:
        return [c for c in self.checks if c.level == "ALERT"]

    @property
    def notes(self) -> list[Check]:
        return [c for c in self.checks if c.level == "note"]

    def lines(self) -> list[str]:
        head = (
            f"{self.fights} rated fights; long-run share: 5.0 {self.classic_rate:.2%}, "
            f"4.5 and up {self.high_rate:.1%}"
        )
        return [head, *(c.line() for c in self.checks)]


def _check(what: str, stars: Sequence[float], threshold: float, rate: float) -> Check | None:
    if len(stars) < MIN_FIGHTS:
        return None
    hits = sum(1 for s in stars if s >= threshold)
    return Check(what, len(stars), hits, len(stars) * rate, binomial_tail(hits, len(stars), rate))


def audit(events: Sequence[ScoredEvent]) -> AuditReport:
    """Checks the latest runs of events and the latest years against the long-run rates."""
    ordered = sorted(events, key=lambda e: e.event_date)
    everything = [s for e in ordered for s in e.stars]
    report = AuditReport(fights=len(everything))
    if not everything:
        return report
    report.classic_rate = sum(1 for s in everything if s >= 5.0) / len(everything)
    report.high_rate = sum(1 for s in everything if s >= 4.5) / len(everything)
    # A rate of zero would make every classic "impossible": keep a floor of one in a thousand.
    classic_p = max(report.classic_rate, 0.001)
    high_p = max(report.high_rate, 0.001)

    for window in WINDOWS:
        run = ordered[-window:]
        stars = [s for e in run for s in e.stars]
        label = f"the latest {len(run)} events"
        for what, threshold, rate in (("5.0", 5.0, classic_p), ("4.5 and up", 4.5, high_p)):
            check = _check(f"{label}, {what}", stars, threshold, rate)
            if check:
                report.checks.append(check)

    years = sorted({e.event_date.year for e in ordered})[-YEARS:]
    for year in years:
        stars = [s for e in ordered if e.event_date.year == year for s in e.stars]
        for what, threshold, rate in (("5.0", 5.0, classic_p), ("4.5 and up", 4.5, high_p)):
            check = _check(f"{year}, {what}", stars, threshold, rate)
            if check:
                report.checks.append(check)
    return report
