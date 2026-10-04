"""`FightDataSource` backed by a public CSV mirror of ufcstats data on GitHub.

The mirror (Greco1899/scrape_ufc_stats, GPL-3.0) is NOT live: it commits a refresh about once
a day (around 18:04 UTC), so new events appear hours after the event. Each run
resolves the latest commit SHA once and reads all files from that SHA, so the three tables
always belong to one consistent snapshot; pinned URLs never change, so they cache forever.

The raw CSVs are third-party data: they are cached locally (gitignored) and never committed.
"""

from __future__ import annotations

import json
import logging
import re

from blindcard_ingest.http.client import PoliteClient
from blindcard_ingest.models import EventBundle, ParsedEvent
from blindcard_ingest.sources.ufcstats.dataset import (
    PROMOTION,
    SOURCE_NAME,
    DatasetError,
    ParsedDataset,
    parse_dataset,
)

logger = logging.getLogger(__name__)

DEFAULT_REPO = "Greco1899/scrape_ufc_stats"
DEFAULT_BRANCH = "main"
FILES = ("ufc_event_details.csv", "ufc_fight_results.csv", "ufc_fight_stats.csv")
_SHA_RE = re.compile(r"[0-9a-f]{40}")


class UfcStatsCsvSource:
    name = SOURCE_NAME
    promotion = PROMOTION

    def __init__(
        self, client: PoliteClient, *, repo: str = DEFAULT_REPO, branch: str = DEFAULT_BRANCH
    ) -> None:
        self._client = client
        self._repo = repo
        self._branch = branch
        self._dataset: ParsedDataset | None = None
        self.snapshot_sha: str | None = None

    def list_completed_events(self) -> list[ParsedEvent]:
        """Always resolves the newest snapshot; fetch_event then reads from that snapshot."""
        self._load()
        assert self._dataset is not None
        return list(self._dataset.events)

    def fetch_event(self, event: ParsedEvent, *, refresh: bool = False) -> EventBundle:
        """`refresh` is a no-op: the snapshot is immutable and chosen by list_completed_events."""
        if self._dataset is None:
            self._load()
        assert self._dataset is not None
        if event.source_id in self._dataset.event_errors:
            raise DatasetError(self._dataset.event_errors[event.source_id])
        try:
            return self._dataset.bundles[event.source_id]
        except KeyError:
            raise DatasetError(
                f"event {event.source_id} is not in snapshot {self.snapshot_sha}"
            ) from None

    def _load(self) -> None:
        sha = self._resolve_sha()
        events_csv, results_csv, stats_csv = (
            self._client.get_html(self._raw_url(sha, name)) for name in FILES
        )
        self._dataset = parse_dataset(events_csv, results_csv, stats_csv)
        self.snapshot_sha = sha
        logger.info(
            "loaded %s@%s: %d events, %d unusable",
            self._repo,
            sha[:10],
            len(self._dataset.events),
            len(self._dataset.event_errors),
        )

    def _resolve_sha(self) -> str:
        url = f"https://api.github.com/repos/{self._repo}/commits?sha={self._branch}&per_page=1"
        body = self._client.get_html(url, max_age_seconds=0)
        try:
            sha = json.loads(body)[0]["sha"]
        except (ValueError, IndexError, KeyError, TypeError) as exc:
            raise DatasetError(f"cannot read the latest commit of {self._repo}: {exc}") from exc
        if not isinstance(sha, str) or not _SHA_RE.fullmatch(sha):
            raise DatasetError(f"unexpected commit sha from {self._repo}: {sha!r}")
        return sha

    def _raw_url(self, sha: str, filename: str) -> str:
        return f"https://raw.githubusercontent.com/{self._repo}/{sha}/{filename}"
