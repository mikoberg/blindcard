"""A fighter's country from Wikidata, for fighters without an article of their own on Wikipedia.

Wikidata (free, CC0) has an item for many fighters, with a one-line description such as
"Brazilian mixed martial artist". The search API returns label and description; the country is
the first nationality of that description. Never a guess: the label must be the fighter's name
(accents ignored), the description must say martial artist / fighter, and every such hit must
agree on the country.
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from collections.abc import Sequence
from typing import Any
from urllib.parse import urlencode

from blindcard_ingest.http.client import PoliteClient
from blindcard_ingest.sources.wikipedia.countries import country_from_phrase

logger = logging.getLogger(__name__)

API_URL = "https://www.wikidata.org/w/api.php"
MAX_AGE_SECONDS = 7 * 24 * 3600
_FIGHTER_WORDS = re.compile(r"mixed martial|\bmma\b|martial artist|\bfighter\b", re.I)


def _fold(text: str) -> str:
    stripped = unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", stripped.lower()).strip()


def country_from_hits(name: str, hits: Sequence[dict[str, Any]]) -> str | None:
    """The country all matching fighter hits agree on, or None."""
    codes: set[str] = set()
    for hit in hits:
        label = str(hit.get("label", ""))
        description = str(hit.get("description", ""))
        if _fold(label) != _fold(name) or not _FIGHTER_WORDS.search(description):
            continue
        code = country_from_phrase(description)
        if code is None:
            return None  # a fighter of that name whose country we cannot read: do not guess
        codes.add(code)
    return next(iter(codes)) if len(codes) == 1 else None


class WikidataClient:
    def __init__(self, client: PoliteClient) -> None:
        self._client = client

    def country_for_fighter(self, name: str) -> str | None:
        query = urlencode(
            {
                "action": "wbsearchentities",
                "search": name,
                "language": "en",
                "type": "item",
                "limit": "7",
                "format": "json",
            }
        )
        body = self._client.get_html(f"{API_URL}?{query}", max_age_seconds=MAX_AGE_SECONDS)
        try:
            data = json.loads(body)
        except ValueError:
            logger.warning("wikidata did not return JSON")
            return None
        hits = data.get("search", []) if isinstance(data, dict) else []
        return country_from_hits(name, [h for h in hits if isinstance(h, dict)])
