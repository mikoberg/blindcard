"""Polite access to the MediaWiki API: batched, cached, with maxlag and our identifying UA.

API etiquette: one request at a time (the shared PoliteClient spaces them >= 1 s), up to 50
titles per query, `maxlag=5` so we back off when the servers are busy, redirects followed.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Sequence
from typing import Any
from urllib.parse import urlencode

from blindcard_ingest.http.client import PoliteClient

logger = logging.getLogger(__name__)

API_URL = "https://en.wikipedia.org/w/api.php"
EVENTS_LIST_PAGE = "List_of_UFC_events"
BATCH_SIZE = 50
LIST_MAX_AGE_SECONDS = 24 * 3600
PAGES_MAX_AGE_SECONDS = 7 * 24 * 3600


class WikipediaError(RuntimeError):
    """The API answered with an error or something we cannot read."""


class WikipediaClient:
    def __init__(self, client: PoliteClient) -> None:
        self._client = client

    def _get_json(self, params: dict[str, str], *, max_age_seconds: float) -> dict[str, Any]:
        query = urlencode({**params, "format": "json", "formatversion": "2", "maxlag": "5"})
        body = self._client.get_html(f"{API_URL}?{query}", max_age_seconds=max_age_seconds)
        try:
            data = json.loads(body)
        except ValueError as exc:
            raise WikipediaError("the API did not return JSON") from exc
        if not isinstance(data, dict):
            raise WikipediaError("unexpected API response shape")
        if "error" in data:
            code = data["error"].get("code", "unknown") if isinstance(data["error"], dict) else "?"
            raise WikipediaError(f"the API reported an error ({code}); try again later")
        return data

    def events_list_wikitext(self) -> str:
        data = self._get_json(
            {"action": "parse", "page": EVENTS_LIST_PAGE, "prop": "wikitext"},
            max_age_seconds=LIST_MAX_AGE_SECONDS,
        )
        try:
            return str(data["parse"]["wikitext"])
        except (KeyError, TypeError) as exc:
            raise WikipediaError("the events list has no wikitext") from exc

    def page_wikitexts(self, titles: Sequence[str]) -> dict[str, str]:
        """Wikitext per REQUESTED title; titles whose page does not exist are absent."""
        result: dict[str, str] = {}
        unique = sorted(set(titles))
        for start in range(0, len(unique), BATCH_SIZE):
            batch = unique[start : start + BATCH_SIZE]
            data = self._get_json(
                {
                    "action": "query",
                    "prop": "revisions",
                    "rvprop": "content",
                    "rvslots": "main",
                    "redirects": "1",
                    "titles": "|".join(batch),
                },
                max_age_seconds=PAGES_MAX_AGE_SECONDS,
            )
            query = data.get("query", {})
            content: dict[str, str] = {}
            for page in query.get("pages", []):
                revisions = page.get("revisions")
                if page.get("missing") or not revisions:
                    continue
                content[page["title"]] = str(revisions[0]["slots"]["main"]["content"])
            forward = {
                item["from"]: item["to"]
                for key in ("normalized", "redirects")
                for item in query.get(key, [])
            }
            for requested in batch:
                final = requested
                for _ in range(5):  # normalisation, then up to a few redirects
                    if final not in forward:
                        break
                    final = forward[final]
                if final in content:
                    result[requested] = content[final]
        logger.info("fetched %d of %d requested event pages", len(result), len(unique))
        return result
