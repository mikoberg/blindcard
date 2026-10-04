"""Polite HTTP client: identifying User-Agent, ~1 request/second, retry with backoff, cache."""

from __future__ import annotations

import logging
import time
from collections.abc import Callable

import httpx

from blindcard_ingest.http.cache import HtmlCache

logger = logging.getLogger(__name__)

RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})
MAX_RETRY_AFTER_SECONDS = 60.0


class FetchError(RuntimeError):
    """A page could not be fetched (after retries where applicable)."""

    def __init__(self, url: str, reason: str, status_code: int | None = None) -> None:
        super().__init__(f"{url}: {reason}")
        self.url = url
        self.status_code = status_code


def looks_like_bot_challenge(body: str) -> bool:
    """True for an interstitial "checking your browser" page served instead of the content."""
    head = body[:6000]
    return "Checking your browser" in head and "requires JavaScript" in head


class PoliteClient:
    def __init__(
        self,
        user_agent: str,
        cache: HtmlCache,
        *,
        min_interval_seconds: float = 1.0,
        max_retries: int = 3,
        backoff_base_seconds: float = 2.0,
        timeout_seconds: float = 30.0,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._cache = cache
        self._min_interval = min_interval_seconds
        self._max_retries = max_retries
        self._backoff_base = backoff_base_seconds
        self._sleep = sleep
        self._clock = clock
        self._last_request_at: float | None = None
        self._http = httpx.Client(
            headers={"User-Agent": user_agent},
            timeout=timeout_seconds,
            transport=transport,
            follow_redirects=True,
        )

    def __enter__(self) -> PoliteClient:
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    def close(self) -> None:
        self._http.close()

    def get_html(self, url: str, *, max_age_seconds: float | None = None) -> str:
        """Return the page body, from cache when fresh enough, otherwise from the network.

        `max_age_seconds=None` accepts any cached copy; pass `0` to force a refetch.
        """
        cached = self._cache.get(url, max_age_seconds)
        if cached is not None:
            logger.debug("cache hit: %s", url)
            return cached
        body = self._fetch(url)
        self._cache.put(url, body)
        return body

    def invalidate(self, url: str) -> None:
        self._cache.invalidate(url)

    def _throttle(self) -> None:
        if self._last_request_at is not None:
            wait = self._last_request_at + self._min_interval - self._clock()
            if wait > 0:
                self._sleep(wait)
        self._last_request_at = self._clock()

    def _fetch(self, url: str) -> str:
        attempt = 0
        while True:
            self._throttle()
            delay: float
            try:
                response = self._http.get(url)
            except httpx.TransportError as exc:
                if attempt >= self._max_retries:
                    raise FetchError(
                        url, f"network error after {attempt + 1} attempts: {exc}"
                    ) from exc
                delay = self._backoff_base * (2**attempt)
                logger.warning("network error for %s (%s); retrying in %.1fs", url, exc, delay)
            else:
                if response.status_code == 200:
                    if looks_like_bot_challenge(response.text):
                        # We never solve or bypass bot checks; stop instead of caching junk.
                        raise FetchError(url, "blocked by a bot-check page", status_code=200)
                    logger.info("fetched %s", url)
                    return response.text
                if response.status_code not in RETRYABLE_STATUS or attempt >= self._max_retries:
                    raise FetchError(
                        url, f"HTTP {response.status_code}", status_code=response.status_code
                    )
                delay = self._retry_delay(response, attempt)
                logger.warning(
                    "HTTP %s for %s; retrying in %.1fs", response.status_code, url, delay
                )
            attempt += 1
            self._sleep(delay)

    def _retry_delay(self, response: httpx.Response, attempt: int) -> float:
        header = response.headers.get("Retry-After")
        if header is not None:
            try:
                return min(max(float(header), 0.0), MAX_RETRY_AFTER_SECONDS)
            except ValueError:
                pass
        return self._backoff_base * (2**attempt)
