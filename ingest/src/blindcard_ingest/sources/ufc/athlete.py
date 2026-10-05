"""A fighter's fighting style, from their official athlete page.

One field of one page per fighter: "Fighting style" (often just "MMA", which says nothing and is
dropped). The page is found from the fighter's name (the site's own slug rule), accepted only when
its title is that same name, checked against robots.txt first and read at the site's crawl delay.
"""

from __future__ import annotations

import logging
import re
from urllib.robotparser import RobotFileParser

from blindcard_ingest.http.client import FetchError, PoliteClient
from blindcard_ingest.judges import name_key
from blindcard_ingest.models import slugify
from blindcard_ingest.sources.ufc.event_times import ROBOTS_URL, SITE, RobotsRefused
from blindcard_ingest.sources.wikipedia.fighter_style import style_labels

logger = logging.getLogger(__name__)

PAGE_MAX_AGE_SECONDS = 30 * 24 * 3600
_TITLE = re.compile(r"<title>\s*([^|<]+?)\s*(?:\||</title>)", re.I)
_BIO = re.compile(
    r"c-bio__label\">\s*Fighting style\s*</div>\s*<div class=\"c-bio__text\">\s*([^<]*?)\s*</div>",
    re.S | re.I,
)


def athlete_slug(name: str) -> str:
    """ "Raul Rosas Jr." -> "raul-rosas-jr", "Lone'er Kavanagh" -> "loneer-kavanagh"."""
    return slugify(name.replace("'", "").replace("’", ""))


def parse_athlete(html: str) -> tuple[str | None, list[str]]:
    """(the name in the page's title, the style labels of the "Fighting style" field)."""
    title = _TITLE.search(html)
    bio = _BIO.search(html)
    return (
        title.group(1).strip() if title else None,
        style_labels(bio.group(1)) if bio else [],
    )


class UfcAthletes:
    """`client` must be built with `min_interval_seconds` of at least the site's crawl delay."""

    def __init__(self, client: PoliteClient, user_agent: str) -> None:
        self._client = client
        self._user_agent = user_agent
        self._robots: RobotFileParser | None = None

    def _load_robots(self) -> RobotFileParser:
        if self._robots is None:
            parser = RobotFileParser()
            parser.parse(self._client.get_html(ROBOTS_URL, max_age_seconds=24 * 3600).splitlines())
            self._robots = parser
        return self._robots

    def style_of(self, name: str) -> list[str] | None:
        """The labels on the page of the fighter called `name`; [] when the page says nothing
        specific; None when there is no page, or it is not (demonstrably) this fighter's."""
        slug = athlete_slug(name)
        if not slug:
            return None
        url = f"{SITE}/athlete/{slug}"
        if not self._load_robots().can_fetch(self._user_agent, url):
            raise RobotsRefused("robots.txt does not allow reading athlete pages")
        try:
            html = self._client.get_html(url, max_age_seconds=PAGE_MAX_AGE_SECONDS)
        except FetchError:
            return None
        title, labels = parse_athlete(html)
        if title is None or name_key(title) != name_key(name):
            return None
        return labels
