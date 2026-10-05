"""The official YouTube Data API v3, to list the videos of a channel (the UFC channel).

Only the sanctioned route: an API key (free quota) and the documented endpoints. The channel's
"uploads" playlist is read page by page (one quota unit per page of 50). Video titles are used only
to match fights and are never stored or shown: they usually say how a fight ended.

The API key travels in the query string, so URLs are never logged and errors never carry them.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)

API_ROOT = "https://www.googleapis.com/youtube/v3"
PAGE_SIZE = 50
TIMEOUT_SECONDS = 20.0


class YouTubeApiError(RuntimeError):
    """The API refused or failed. The message never contains the request URL or the key."""


@dataclass(frozen=True)
class Video:
    video_id: str
    title: str
    channel_title: str
    published: str  # ISO timestamp as the API gives it


class YouTubeClient:
    def __init__(
        self,
        api_key: str,
        *,
        client: httpx.Client | None = None,
        interval_seconds: float = 0.25,
    ) -> None:
        if not api_key:
            raise YouTubeApiError("no YouTube API key")
        self._key = api_key
        self._client = client or httpx.Client(timeout=TIMEOUT_SECONDS)
        self._interval = interval_seconds
        self._last = 0.0

    def _get(self, path: str, params: dict[str, str | int]) -> dict[str, Any]:
        wait = self._interval - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        try:
            response = self._client.get(f"{API_ROOT}/{path}", params={**params, "key": self._key})
        except httpx.HTTPError as exc:
            raise YouTubeApiError(f"YouTube API request failed ({type(exc).__name__})") from None
        finally:
            self._last = time.monotonic()
        if response.status_code != 200:
            reason = _error_reason(response)
            raise YouTubeApiError(f"YouTube API error {response.status_code}: {reason}")
        data: dict[str, Any] = response.json()
        return data

    def uploads_playlist(self, handle: str) -> tuple[str, str]:
        """(uploads playlist id, channel title) of a channel handle such as "UFC"."""
        data = self._get(
            "channels",
            {"part": "contentDetails,snippet", "forHandle": handle.lstrip("@")},
        )
        items = data.get("items") or []
        if len(items) != 1:
            raise YouTubeApiError("channel handle not found")
        item = items[0]
        return item["contentDetails"]["relatedPlaylists"]["uploads"], item["snippet"]["title"]

    def list_videos(self, playlist_id: str, *, max_pages: int | None = None) -> Iterator[Video]:
        token: str | None = None
        pages = 0
        while True:
            params: dict[str, str | int] = {
                "part": "snippet",
                "playlistId": playlist_id,
                "maxResults": PAGE_SIZE,
            }
            if token:
                params["pageToken"] = token
            data = self._get("playlistItems", params)
            for item in data.get("items", []):
                snippet = item.get("snippet", {})
                video_id = (snippet.get("resourceId") or {}).get("videoId")
                if video_id:
                    yield Video(
                        video_id=video_id,
                        title=snippet.get("title", ""),
                        channel_title=snippet.get("videoOwnerChannelTitle")
                        or snippet.get("channelTitle", ""),
                        published=snippet.get("publishedAt", ""),
                    )
            pages += 1
            token = data.get("nextPageToken")
            if not token or (max_pages is not None and pages >= max_pages):
                return


def _error_reason(response: httpx.Response) -> str:
    try:
        error = response.json().get("error", {})
        errors = error.get("errors") or [{}]
        return str(errors[0].get("reason") or error.get("status") or "unknown")
    except (ValueError, AttributeError):
        return "unknown"
