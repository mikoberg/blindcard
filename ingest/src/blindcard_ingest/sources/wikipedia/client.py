"""Polite access to the MediaWiki API: batched, cached, with maxlag and our identifying UA.

API etiquette: one request at a time (the shared PoliteClient spaces them >= 1 s), up to 50
titles per query, `maxlag=5` so we back off when the servers are busy, redirects followed.
"""

from __future__ import annotations

import datetime as dt
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
RANKINGS_PAGE = "UFC_rankings"
RANKINGS_LIST_MAX_AGE_SECONDS = 3600
REVISION_MAX_AGE_SECONDS = 365 * 24 * 3600


def _revision_rows(data: dict[str, Any]) -> list[tuple[int, dt.datetime]]:
    rows: list[tuple[int, dt.datetime]] = []
    for page in data.get("query", {}).get("pages", []):
        for revision in page.get("revisions") or []:
            try:
                when = dt.datetime.strptime(str(revision["timestamp"]), "%Y-%m-%dT%H:%M:%SZ")
                rows.append((int(revision["revid"]), when.replace(tzinfo=dt.UTC)))
            except (KeyError, TypeError, ValueError):
                continue
    return rows


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

    def ranking_revisions(self, since: dt.datetime) -> list[tuple[int, dt.datetime]]:
        """The revisions of the UFC rankings article from the one in force at `since` on, oldest
        first, as (revision id, time in UTC). Revisions never change, so a revision's text can be
        kept for good; the list itself is refreshed hourly."""
        stamp = since.strftime("%Y-%m-%dT%H:%M:%SZ")
        revisions: list[tuple[int, dt.datetime]] = []
        base = {
            "action": "query",
            "prop": "revisions",
            "titles": RANKINGS_PAGE,
            "rvprop": "ids|timestamp",
        }
        # The revision in force at `since` (the newest one before it), then everything after.
        start = self._get_json(
            {**base, "rvlimit": "1", "rvdir": "older", "rvstart": stamp},
            max_age_seconds=RANKINGS_LIST_MAX_AGE_SECONDS,
        )
        revisions.extend(_revision_rows(start))
        params = {**base, "rvlimit": "500", "rvdir": "newer", "rvstart": stamp}
        for _ in range(40):  # a page of 500 each time; a few years are a few pages
            data = self._get_json(params, max_age_seconds=RANKINGS_LIST_MAX_AGE_SECONDS)
            revisions.extend(_revision_rows(data))
            more = data.get("continue", {}).get("rvcontinue")
            if not more:
                break
            params = {**params, "rvcontinue": str(more)}
        unique = {revid: when for revid, when in revisions}
        return sorted(unique.items(), key=lambda item: item[1])

    def revision_wikitexts(self, revids: Sequence[int], *, batch_size: int = 8) -> dict[int, str]:
        """The wikitext of each requested revision of the rankings article (kept for good: a
        revision never changes). Small batches: each text is 25 to 170 KB."""
        result: dict[int, str] = {}
        unique = sorted(set(revids))
        for start in range(0, len(unique), batch_size):
            batch = unique[start : start + batch_size]
            data = self._get_json(
                {
                    "action": "query",
                    "prop": "revisions",
                    "rvprop": "ids|content",
                    "rvslots": "main",
                    "revids": "|".join(str(r) for r in batch),
                },
                max_age_seconds=REVISION_MAX_AGE_SECONDS,
            )
            for page in data.get("query", {}).get("pages", []):
                for revision in page.get("revisions") or []:
                    try:
                        result[int(revision["revid"])] = str(revision["slots"]["main"]["content"])
                    except (KeyError, TypeError, ValueError):
                        continue
        logger.info("fetched %d of %d requested revisions", len(result), len(unique))
        return result

    def search_titles(self, query: str, *, limit: int = 3) -> list[str]:
        """Titles of the best article matches for `query` (accent-insensitive: "Natalia Silva"
        finds "Natalia Silva (fighter)" and "Natália Silva")."""
        data = self._get_json(
            {
                "action": "query",
                "list": "search",
                "srsearch": query,
                "srnamespace": "0",
                "srlimit": str(limit),
            },
            max_age_seconds=PAGES_MAX_AGE_SECONDS,
        )
        hits = data.get("query", {}).get("search", [])
        return [str(hit["title"]) for hit in hits if isinstance(hit, dict) and "title" in hit]

    def page_wikitexts(
        self,
        titles: Sequence[str],
        *,
        batch_size: int = BATCH_SIZE,
        max_age_seconds: float | None = None,
    ) -> dict[str, str]:
        """Wikitext per REQUESTED title; titles whose page does not exist are absent.

        Long pages (a fighter's career) need a small `batch_size`: the API cuts off a reply
        that gets too large.
        """
        result: dict[str, str] = {}
        unique = sorted(set(titles))
        for start in range(0, len(unique), batch_size):
            batch = unique[start : start + batch_size]
            data = self._get_json(
                {
                    "action": "query",
                    "prop": "revisions",
                    "rvprop": "content",
                    "rvslots": "main",
                    "redirects": "1",
                    "titles": "|".join(batch),
                },
                max_age_seconds=(
                    PAGES_MAX_AGE_SECONDS if max_age_seconds is None else max_age_seconds
                ),
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
        logger.info("fetched %d of %d requested pages", len(result), len(unique))
        return result
