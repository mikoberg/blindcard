"""Start times from the official event page: three timestamps, read politely."""

from __future__ import annotations

import datetime as dt
from pathlib import Path

import pytest
from fakes import FakeRepository
from test_upcoming import CARD, LIST, TODAY, FakeWiki

from blindcard_ingest.http.client import FetchError
from blindcard_ingest.sources.ufc.event_times import (
    EventTimes,
    RobotsRefused,
    UfcEventTimes,
    event_url_from_wikitext,
    parse_event_times,
)
from blindcard_ingest.upcoming_pipeline import run_ingest_upcoming

FIXTURE = (Path(__file__).parent / "fixtures" / "ufc_event_times.html").read_text(encoding="utf-8")
EVENT_DATE = dt.date(2026, 10, 24)


def utc(*args: int) -> dt.datetime:
    return dt.datetime(*args, tzinfo=dt.UTC)


def test_the_three_start_times_are_read_as_utc() -> None:
    times = parse_event_times(FIXTURE, event_date=EVENT_DATE)
    assert times.main_card == utc(2026, 10, 24, 18, 0)
    assert times.prelims == utc(2026, 10, 24, 16, 0)
    assert times.early_prelims == utc(2026, 10, 24, 14, 0)
    assert times.known


def test_a_time_that_does_not_fit_the_event_date_is_not_believed() -> None:
    # e.g. a ticket sale date or a page of another event: three weeks off
    assert parse_event_times(FIXTURE, event_date=dt.date(2026, 11, 14)) == EventTimes()
    assert not parse_event_times("<html>nothing here</html>", event_date=EVENT_DATE).known


def test_a_late_us_card_is_the_next_day_in_utc_and_still_believed() -> None:
    html = FIXTURE.replace("1792864800", "1792893600")  # 02:00 UTC on the 25th
    assert parse_event_times(html, event_date=EVENT_DATE).main_card == utc(2026, 10, 25, 2, 0)


def test_only_timestamps_are_read_nothing_else_of_the_page() -> None:
    noisy = FIXTURE + "<div>Raoni Barcelos def. Raul Rosas Jr. by KO, round 2, 1:38</div>"
    times = parse_event_times(noisy, event_date=EVENT_DATE)
    assert times == parse_event_times(FIXTURE, event_date=EVENT_DATE)
    assert set(vars(times)) == {"main_card", "prelims", "early_prelims"}


def test_the_official_event_url_comes_from_the_article() -> None:
    text = "see <ref>{{Cite web|url=https://www.ufc.com/event/ufc-333|title=x}}</ref>"
    assert event_url_from_wikitext(text) == "https://www.ufc.com/event/ufc-333"
    assert event_url_from_wikitext("no link") is None


ROBOTS_ALLOW = "User-agent: *\ncrawl-delay: 15\nDisallow: /core/\n"
ROBOTS_DENY = "User-agent: *\nDisallow: /event/\n"


class FakeClient:
    def __init__(self, robots: str, page: str | Exception) -> None:
        self.robots, self.page = robots, page
        self.fetched: list[str] = []

    def get_html(self, url: str, *, max_age_seconds: float | None = None) -> str:
        self.fetched.append(url)
        if url.endswith("/robots.txt"):
            return self.robots
        if isinstance(self.page, Exception):
            raise self.page
        return self.page


def test_robots_is_read_first_and_its_crawl_delay_is_known() -> None:
    client = FakeClient(ROBOTS_ALLOW, FIXTURE)
    site = UfcEventTimes(client, "BlindcardBot/0.1")  # type: ignore[arg-type]
    assert site.crawl_delay() == 15.0
    times = site.event_times("https://www.ufc.com/event/ufc-333", event_date=EVENT_DATE)
    assert times is not None and times.main_card == utc(2026, 10, 24, 18, 0)
    assert client.fetched[0].endswith("/robots.txt")


def test_a_page_robots_does_not_allow_is_never_fetched() -> None:
    client = FakeClient(ROBOTS_DENY, FIXTURE)
    site = UfcEventTimes(client, "BlindcardBot/0.1")  # type: ignore[arg-type]
    with pytest.raises(RobotsRefused):
        site.event_times("https://www.ufc.com/event/ufc-333", event_date=EVENT_DATE)
    assert not any("/event/" in url for url in client.fetched)


def test_a_failed_fetch_or_an_empty_page_gives_no_times_not_an_error() -> None:
    failing = FakeClient(ROBOTS_ALLOW, FetchError("https://x", "boom"))
    assert (
        UfcEventTimes(failing, "b").event_times(
            "https://www.ufc.com/event/x", event_date=EVENT_DATE
        )
        is None
    )  # type: ignore[arg-type]
    empty = FakeClient(ROBOTS_ALLOW, "<html></html>")
    assert (
        UfcEventTimes(empty, "b").event_times("https://www.ufc.com/event/x", event_date=EVENT_DATE)
        is None
    )  # type: ignore[arg-type]


class FakeTimes:
    def __init__(self) -> None:
        self.asked: list[tuple[str, dt.date]] = []

    def event_times(self, url: str, *, event_date: dt.date) -> EventTimes | None:
        self.asked.append((url, event_date))
        return EventTimes(main_card=utc(2026, 10, 10, 23, 0))


CITED = (
    CARD + "<ref>{{Cite web|url=https://www.ufc.com/event/ufc-fight-night-october-10-2026}}</ref>"
)


def test_times_are_read_only_for_events_ahead_with_a_cited_page_and_near_enough() -> None:
    wiki = FakeWiki({"UFC Fight Night: Allen vs. Duncan": CITED, "UFC 333": CARD})
    repo, times = FakeRepository(), FakeTimes()
    report = run_ingest_upcoming(wiki, repo, today=TODAY, times_source=times)  # type: ignore[arg-type]
    assert times.asked == [
        ("https://www.ufc.com/event/ufc-fight-night-october-10-2026", dt.date(2026, 10, 10))
    ]
    by_name = {e.name: e for e in repo.upcoming}
    assert by_name["UFC Fight Night: Allen vs. Duncan"].main_card_at == utc(2026, 10, 10, 23, 0)
    assert by_name["UFC 333"].main_card_at is None  # no cited page: nothing guessed
    assert report.times_found == 1


def test_an_event_far_ahead_is_not_asked() -> None:
    far = LIST.replace("{{dts|2026|Oct|24}}", "{{dts|2027|Jun|24}}")
    wiki = FakeWiki({"UFC Fight Night: Allen vs. Duncan": CARD, "UFC 333": CITED})
    wiki.events_list_wikitext = lambda: far  # type: ignore[method-assign]
    times = FakeTimes()
    run_ingest_upcoming(wiki, FakeRepository(), today=TODAY, times_source=times)  # type: ignore[arg-type]
    assert times.asked == []


def test_a_refusal_by_robots_stops_all_further_reads_and_the_run_still_succeeds() -> None:
    class Refusing:
        calls = 0

        def event_times(self, url: str, *, event_date: dt.date) -> EventTimes | None:
            Refusing.calls += 1
            raise RobotsRefused("no")

    both = CITED.replace("october-10-2026", "october-10-2026")
    wiki = FakeWiki({"UFC Fight Night: Allen vs. Duncan": both, "UFC 333": both})
    repo = FakeRepository()
    report = run_ingest_upcoming(wiki, repo, today=TODAY, times_source=Refusing())  # type: ignore[arg-type]
    assert Refusing.calls == 1 and report.events_stored == 2 and report.times_found == 0
