"""On-disk cache of raw HTML, keyed by URL.

Raw pages are cached so re-runs and backfills never hit the source twice for the same page.
"""

from __future__ import annotations

import contextlib
import hashlib
import logging
import os
import re
import time
from collections.abc import Callable
from pathlib import Path

logger = logging.getLogger(__name__)

_SLUG_RE = re.compile(r"[^a-z0-9]+")


class HtmlCache:
    def __init__(self, directory: Path, *, now: Callable[[], float] = time.time) -> None:
        self._dir = directory
        self._now = now

    def _path(self, url: str) -> Path:
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
        readable = _SLUG_RE.sub("-", url.lower()).strip("-")[-80:].strip("-")
        return self._dir / f"{readable}-{digest}.html"

    def get(self, url: str, max_age_seconds: float | None = None) -> str | None:
        """Return the cached body, or None on a miss.

        `max_age_seconds=None` accepts any age; `0` never accepts the cache.
        """
        path = self._path(url)
        try:
            stat = path.stat()
        except FileNotFoundError:
            return None
        if max_age_seconds is not None and (self._now() - stat.st_mtime) >= max_age_seconds:
            logger.debug("cache stale: %s", url)
            return None
        try:
            return path.read_text(encoding="utf-8")
        except OSError:
            logger.warning("cache unreadable, treating as miss: %s", path, exc_info=True)
            return None

    def put(self, url: str, body: str) -> None:
        """Write atomically so an interrupted run never leaves a half-written page."""
        path = self._path(url)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".html.tmp")
        tmp.write_text(body, encoding="utf-8")
        os.replace(tmp, path)

    def invalidate(self, url: str) -> None:
        """Drop a cached page (e.g. it parsed as incomplete and must be refetched later)."""
        with contextlib.suppress(FileNotFoundError):
            self._path(url).unlink()
