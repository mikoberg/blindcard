"""A fighter's professional record and country from Sherdog, for fighters without a Wikipedia page.

Sherdog's fighter page has a "FIGHT HISTORY - PRO" table with the result, opponent, event and
date of every bout. The record BEFORE a bout is the number of wins, losses, draws and no
contests among the rows dated strictly before it: the bout's own row is only used to find its
date and opponent, never its result, and nothing after it is counted.

Never guess: a bout is found only when exactly one row matches both the date and the opponent;
otherwise there is no record. Only the pro table is read (amateur fights are not on the record).
The site allows bots (robots.txt: Allow: /); requests are spaced and cached by PoliteClient.
"""

from __future__ import annotations

import datetime as dt
import logging
import re
import unicodedata
from dataclasses import dataclass
from html import unescape
from urllib.parse import quote_plus, unquote

from blindcard_ingest.bonus_matching import EventIndex, FightNames
from blindcard_ingest.http.client import PoliteClient
from blindcard_ingest.sources.wikipedia.countries import COUNTRIES
from blindcard_ingest.sources.wikipedia.fighter_record import DEBUT, Record

logger = logging.getLogger(__name__)

BASE_URL = "https://www.sherdog.com"
SEARCH_URL = BASE_URL + "/stats/fightfinder?SearchTxt="
MAX_AGE_SECONDS = 7 * 24 * 3600
MAX_CANDIDATES = 3

_MONTHS = {
    name: index
    for index, name in enumerate(
        ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"],
        start=1,
    )
}
_RESULTS = {"win", "loss", "draw", "no_contest"}


@dataclass(frozen=True)
class SherdogBout:
    """One pro bout of the history. `result` is only ever counted for EARLIER bouts."""

    date: dt.date
    opponent: str
    result: str  # win / loss / draw / no_contest


@dataclass(frozen=True)
class SherdogPage:
    url: str
    country: str | None
    bouts: tuple[SherdogBout, ...]


def _text(fragment: str) -> str:
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


_SUFFIXES = {"jr", "sr", "ii", "iii", "iv"}


def _key(name: str) -> str:
    """Name for comparing: accents, case, punctuation and generational suffixes ignored."""
    plain = unicodedata.normalize("NFD", unquote(name)).encode("ascii", "ignore").decode()
    # Sherdog's slugs drop apostrophes and dots ("Casey-ONeill", "TJ-Dillashaw"): so do we.
    plain = re.sub(r"[.'`’]", "", plain)
    words = [w for w in re.findall(r"[a-z0-9]+", plain.lower()) if w not in _SUFFIXES]
    return " ".join(words)


def parse_search(html: str, name: str) -> list[str]:
    """Fighter page paths in a search result whose name is `name` (strictly the same name)."""
    found: list[str] = []
    for match in re.finditer(r'href="(/fighter/([^"/]+?)-(\d+))"', html):
        path, slug = match.group(1), match.group(2)
        if path not in found and _key(slug.replace("-", " ")) == _key(name):
            found.append(path)
    return found


def _date(text: str) -> dt.date | None:
    match = re.search(r"([A-Za-z]{3})[a-z]*\s*/\s*(\d{1,2})\s*/\s*(\d{4})", text)
    if not match:
        return None
    month = _MONTHS.get(match.group(1).lower())
    try:
        return dt.date(int(match.group(3)), month, int(match.group(2))) if month else None
    except ValueError:
        return None


def _country(html: str) -> str | None:
    match = re.search(r'itemprop="nationality"[^>]*>([^<]+)<', html)
    return COUNTRIES.get(_text(match.group(1)).lower()) if match else None


def parse_fighter_page(html: str, url: str = "") -> SherdogPage:
    """The pro fight history and the country of a Sherdog fighter page."""
    start = html.find("FIGHT HISTORY - PRO")
    end = html.find("FIGHT HISTORY - AMATEUR", start) if start >= 0 else -1
    section = html[start : end if end > 0 else len(html)] if start >= 0 else ""
    bouts: list[SherdogBout] = []
    for row in re.findall(r"<tr>(.*?)</tr>", section, re.S):
        result = re.search(r"final_result\s+(\w+)", row)
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if not result or result.group(1) not in _RESULTS or len(cells) < 3:
            continue
        date = _date(cells[2])
        opponent = _text(cells[1])
        if date is not None and opponent:
            bouts.append(SherdogBout(date=date, opponent=opponent, result=result.group(1)))
    return SherdogPage(url=url, country=_country(html), bouts=tuple(bouts))


def record_before_bout(
    bouts: tuple[SherdogBout, ...] | list[SherdogBout],
    event_date: dt.date,
    opponent: str,
    *,
    tolerance_days: int = 1,
) -> Record | None:
    """The record before the bout on `event_date` against `opponent`, or None (never a guess)."""
    index = EventIndex([FightNames("opponent", (opponent, "Nobody Nowhere"))])
    matches = [
        bout
        for bout in bouts
        if abs((bout.date - event_date).days) <= tolerance_days
        and index.resolve(bout.opponent) == "opponent"
    ]
    if len(matches) != 1:
        return None
    day = matches[0].date
    earlier = [bout for bout in bouts if bout.date < day]
    if not earlier:
        return DEBUT
    return Record(
        wins=sum(1 for b in earlier if b.result == "win"),
        losses=sum(1 for b in earlier if b.result == "loss"),
        draws=sum(1 for b in earlier if b.result == "draw"),
        no_contests=sum(1 for b in earlier if b.result == "no_contest"),
    )


class SherdogClient:
    def __init__(self, client: PoliteClient) -> None:
        self._client = client

    def pages_for(self, name: str) -> list[SherdogPage]:
        """The pages of fighters of this name (a few at most; the caller checks which is right)."""
        search = self._client.get_html(
            SEARCH_URL + quote_plus(name), max_age_seconds=MAX_AGE_SECONDS
        )
        pages: list[SherdogPage] = []
        for path in parse_search(search, name)[:MAX_CANDIDATES]:
            html = self._client.get_html(BASE_URL + path, max_age_seconds=MAX_AGE_SECONDS)
            pages.append(parse_fighter_page(html, path))
        return pages
