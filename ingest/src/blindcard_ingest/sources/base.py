"""The seam between the pipeline and any fight-data source (ufcstats now, ESPN as a fallback)."""

from __future__ import annotations

from typing import Protocol

from blindcard_ingest.models import EventBundle, ParsedEvent


class FightDataSource(Protocol):
    #: Stored in `events.source` / `fights.source`; part of every natural key.
    name: str
    #: Stored in `events.promotion`, e.g. "UFC" (a plain fact in data, never branding).
    promotion: str

    def list_completed_events(self) -> list[ParsedEvent]:
        """All completed events the source knows, always fresh (never served from cache)."""
        ...

    def fetch_event(self, event: ParsedEvent, *, refresh: bool = False) -> EventBundle:
        """Fetch one event with all its fights, results and round stats.

        `refresh=True` bypasses cached pages (needed while the source is still filling in
        stats after an event). Fights whose data is missing come back with `result=None`
        and/or no rounds; they are never guessed.
        """
        ...
