"""ingest-videos: link five-star fights to their official full-fight video on the UFC channel.

The video id is the only thing stored (an opaque 11-character id): the video's title usually says
how the fight ended, so titles are used for matching and then dropped. Never guess: a fight is
linked only when exactly one video fits.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol

from blindcard_ingest.db.repository import Repository
from blindcard_ingest.sources.youtube import Video
from blindcard_ingest.video_matching import FightToMatch, match_fights

logger = logging.getLogger(__name__)


class VideoSource(Protocol):
    def uploads_playlist(self, handle: str) -> tuple[str, str]: ...

    def list_videos(self, playlist_id: str, *, max_pages: int | None = None) -> object: ...


@dataclass
class VideosReport:
    fights: int = 0
    videos_read: int = 0
    linked: int = 0
    ambiguous: int = 0
    missing: int = 0

    def summary(self) -> str:
        return (
            f"fights={self.fights} videos_read={self.videos_read} linked={self.linked} "
            f"ambiguous={self.ambiguous} missing={self.missing}"
        )


def run_ingest_videos(
    source: VideoSource,
    repo: Repository,
    *,
    handle: str = "UFC",
    min_stars: float = 5.0,
    max_pages: int | None = None,
    dry_run: bool = False,
) -> VideosReport:
    fights = [
        FightToMatch(f.fight_id, f.fighter_a, f.fighter_b, f.event_name)
        for f in repo.rated_fights(min_stars)
    ]
    report = VideosReport(fights=len(fights))
    if not fights:
        logger.info("ingest-videos: no fights at %.1f stars or more", min_stars)
        return report

    playlist, channel = source.uploads_playlist(handle)
    videos: list[Video] = [v for v in source.list_videos(playlist, max_pages=max_pages)]  # type: ignore[attr-defined]
    # Only videos the channel itself published (a playlist can hold other channels' uploads).
    videos = [v for v in videos if not v.channel_title or v.channel_title == channel]
    report.videos_read = len(videos)

    result = match_fights(fights, videos)
    report.linked = len(result.matched)
    report.ambiguous = len(result.ambiguous)
    report.missing = len(result.missing)
    if not dry_run:
        repo.set_fight_videos(result.matched, channel=channel)
    logger.info("ingest-videos%s: %s", " (dry run)" if dry_run else "", report.summary())
    return report
