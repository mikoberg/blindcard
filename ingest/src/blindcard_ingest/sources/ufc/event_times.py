"""Start times of an event, read from its official event page.

Only three numbers are read from the page: the UTC timestamps of the main card, the prelims and
the early prelims. Nothing else on the page is parsed or kept (it holds the card and, after the
event, its results). The page is only read while the event is still ahead, it must be allowed by
the site's robots.txt, and the site's crawl delay is honoured (see `UfcEventTimes`).
"""

from __future__ import annotations

import datetime as dt
import logging
import re
from dataclasses import dataclass
from urllib.robotparser import RobotFileParser

from blindcard_ingest.http.client import FetchError, PoliteClient

logger = logging.getLogger(__name__)

SITE = "https://www.ufc.com"
ROBOTS_URL = f"{SITE}/robots.txt"
#: The event URL as cited by the Wikipedia article of the event.
EVENT_URL = re.compile(r"https?://www\.ufc\.com/event/[A-Za-z0-9\-]+")
#: Used when robots.txt names no crawl delay.
DEFAULT_CRAWL_DELAY = 15.0
PAGE_MAX_AGE_SECONDS = 6 * 3600

_LABELS = {"main card": "main", "prelims": "prelims", "early prelims": "early_prelims"}
# "Main Card" as the title of a card block, then the time element that follows it.
_CARD_BLOCK = re.compile(
    r"c-event-fight-card-broadcaster__card-title\">\s*<strong>\s*([A-Za-z ]+?)\s*</strong>"
    r".{0,900}?data-timestamp=\"(\d{9,11})\"",
    re.S,
)
# The same labels in the list of ways to watch: "Early Prelims" ... time with a timestamp.
_VIEWING = re.compile(
    r"c-listing-viewing-option__fight-card\">\s*([A-Za-z ]+?)\s*</div>"
    r".{0,400}?data-timestamp=\"(\d{9,11})\"",
    re.S,
)


@dataclass(frozen=True)
class EventTimes:
    main_card: dt.datetime | None = None
    prelims: dt.datetime | None = None
    early_prelims: dt.datetime | None = None

    @property
    def known(self) -> bool:
        return any((self.main_card, self.prelims, self.early_prelims))


def event_url_from_wikitext(wikitext: str) -> str | None:
    """The official event page cited by the article, if there is one."""
    match = EVENT_URL.search(wikitext)
    return match.group(0) if match else None


def parse_event_times(html: str, *, event_date: dt.date) -> EventTimes:
    """The three start times, each only when it is believable for this event: within a day before
    to two days after the event's date (a late card in the Americas is the next day in UTC)."""
    found: dict[str, dt.datetime] = {}
    for pattern in (_CARD_BLOCK, _VIEWING):
        for label, stamp in pattern.findall(html):
            key = _LABELS.get(label.strip().lower())
            if key is None or key in found:
                continue
            moment = dt.datetime.fromtimestamp(int(stamp), dt.UTC)
            if -1 <= (moment.date() - event_date).days <= 2:
                found[key] = moment
    return EventTimes(
        main_card=found.get("main"),
        prelims=found.get("prelims"),
        early_prelims=found.get("early_prelims"),
    )


class RobotsRefused(RuntimeError):
    """The site's robots.txt does not allow reading event pages."""


class UfcEventTimes:
    """Reads start times politely: robots.txt first, then one page per event at the site's crawl
    delay. `client` must be built with `min_interval_seconds` of at least the crawl delay."""

    def __init__(self, client: PoliteClient, user_agent: str) -> None:
        self._client = client
        self._user_agent = user_agent
        self._robots: RobotFileParser | None = None

    def crawl_delay(self) -> float:
        self._load_robots()
        assert self._robots is not None
        delay = self._robots.crawl_delay(self._user_agent)
        return float(delay) if delay else DEFAULT_CRAWL_DELAY

    def _load_robots(self) -> None:
        if self._robots is not None:
            return
        parser = RobotFileParser()
        parser.parse(self._client.get_html(ROBOTS_URL, max_age_seconds=24 * 3600).splitlines())
        self._robots = parser

    def event_times(self, url: str, *, event_date: dt.date) -> EventTimes | None:
        """None when the page is not allowed, cannot be fetched or holds no believable times."""
        self._load_robots()
        assert self._robots is not None
        if not self._robots.can_fetch(self._user_agent, url):
            raise RobotsRefused("robots.txt does not allow reading event pages")
        try:
            html = self._client.get_html(url, max_age_seconds=PAGE_MAX_AGE_SECONDS)
        except FetchError:
            logger.warning("start times: an event page could not be fetched")
            return None
        times = parse_event_times(html, event_date=event_date)
        return times if times.known else None
