"""Score audit: a stretch of classics that is too unlikely to be luck gets flagged."""

from __future__ import annotations

import datetime as dt
import random

import pytest
from fakes import FakeRepository

from blindcard_ingest.audit import ALERT_BELOW, ScoredEvent, audit, binomial_tail


def make_events(n_events: int, classic_every: int | None, *, seed: int = 1) -> list[ScoredEvent]:
    """Twelve fights per event; roughly one in `classic_every` is a 5.0, the rest spread out."""
    rng = random.Random(seed)
    events = []
    date = dt.date(2015, 1, 3)
    for i in range(n_events):
        date += dt.timedelta(days=7)
        stars = tuple(
            5.0
            if classic_every and rng.random() < 1 / classic_every
            else rng.choice([2.0, 2.5, 3.0, 3.5, 4.0])
            for _ in range(12)
        )
        events.append(ScoredEvent(date, f"Event {i}", stars))
    return events


def test_the_binomial_tail_is_the_chance_of_that_many_or_more() -> None:
    assert binomial_tail(0, 10, 0.1) == 1.0
    assert binomial_tail(11, 10, 0.1) == 0.0
    assert binomial_tail(1, 10, 0.1) == pytest.approx(1 - 0.9**10)
    # four or more classics in 70 fights at a 1.3% rate is unlikely, but not impossible
    assert 0.005 < binomial_tail(4, 70, 0.013) < 0.03


def test_a_steady_history_raises_no_flag() -> None:
    report = audit(make_events(400, 80))
    assert report.fights == 400 * 12
    assert report.alerts == []
    assert 0.005 < report.classic_rate < 0.025


def test_a_run_of_classics_at_the_end_is_flagged_as_an_alert() -> None:
    events = make_events(400, 80)
    # the last six events: a classic in half of the fights
    last = events[-6:]
    events[-6:] = [
        ScoredEvent(e.event_date, e.name, tuple(5.0 if j % 2 == 0 else 3.0 for j in range(12)))
        for e in last
    ]
    report = audit(events)
    flagged = {c.what for c in report.alerts}
    assert "the latest 6 events, 5.0" in flagged
    assert all(c.p_value < ALERT_BELOW for c in report.alerts)
    assert any("latest 6 events" in line and "ALERT" in line for line in report.lines())


def test_a_whole_year_that_drifts_up_is_flagged() -> None:
    events = make_events(300, 100)
    year = events[-1].event_date.year
    events = [
        ScoredEvent(e.event_date, e.name, tuple(5.0 if j < 2 else s for j, s in enumerate(e.stars)))
        if e.event_date.year == year
        else e
        for e in events
    ]
    assert any(f"{year}, 5.0" == c.what for c in audit(events).alerts)


def test_too_few_fights_say_nothing_and_an_empty_history_is_fine() -> None:
    assert audit([]).checks == []
    few = make_events(3, 10)
    assert audit(few).checks == []  # under the minimum number of fights per check


def test_the_repository_feeds_the_audit() -> None:
    repo = FakeRepository(event_stars=make_events(60, 80))
    assert audit(repo.scored_events()).fights == 60 * 12
