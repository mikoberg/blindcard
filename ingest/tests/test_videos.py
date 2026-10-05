"""Linking fights to the official full-fight videos of the UFC channel."""

from __future__ import annotations

import httpx
import pytest
from fakes import FakeRepository

from blindcard_ingest.db.repository import RatedFight
from blindcard_ingest.sources.youtube import Video, YouTubeApiError, YouTubeClient
from blindcard_ingest.video_matching import FightToMatch, event_number, match_fights
from blindcard_ingest.videos_pipeline import run_ingest_videos


def video(
    video_id: str, title: str, published: str = "2020-01-01T00:00:00Z", channel: str = "UFC"
) -> Video:
    return Video(video_id=video_id, title=title, channel_title=channel, published=published)


def fight(fight_id: str, a: str, b: str, event: str) -> FightToMatch:
    return FightToMatch(fight_id=fight_id, fighter_a=a, fighter_b=b, event_name=event)


def test_a_free_fight_title_with_both_names_is_the_video() -> None:
    result = match_fights(
        [fight("f1", "Frankie Edgar", "Gray Maynard", "UFC 125: Resolution")],
        [
            video("AAAAAAAAAAA", "Free Fight: Frankie Edgar vs Gray Maynard | UFC 125"),
            video("BBBBBBBBBBB", "Frankie Edgar Highlights"),
        ],
    )
    assert result.matched == {"f1": "AAAAAAAAAAA"}


def test_videos_that_are_not_the_fight_are_ignored() -> None:
    result = match_fights(
        [fight("f1", "Max Holloway", "Dustin Poirier", "UFC 236: Holloway vs. Poirier 2")],
        [
            video("AAAAAAAAAAA", "Max Holloway vs Dustin Poirier | Top 10 Highlights"),
            video("BBBBBBBBBBB", "Holloway vs Poirier 2 | Weigh-in face off"),
        ],
    )
    assert result.matched == {} and result.missing == ["f1"]


def test_a_video_of_another_event_number_is_never_used() -> None:
    result = match_fights(
        [fight("f1", "Max Holloway", "Dustin Poirier", "UFC 236: Holloway vs. Poirier 2")],
        [video("AAAAAAAAAAA", "Free Fight: Max Holloway vs Dustin Poirier | UFC 143")],
    )
    assert result.matched == {}


def test_rematches_are_told_apart_by_the_event_number_and_never_guessed() -> None:
    fights = [
        fight("f1", "Max Holloway", "Dustin Poirier", "UFC 143: Diaz vs. Condit"),
        fight("f2", "Max Holloway", "Dustin Poirier", "UFC 236: Holloway vs. Poirier 2"),
        fight("f3", "Max Holloway", "Dustin Poirier", "UFC Fight Night: Poirier vs. Holloway 3"),
    ]
    videos = [
        video("AAAAAAAAAAA", "Free Fight: Max Holloway vs Dustin Poirier | UFC 143"),
        video("BBBBBBBBBBB", "Free Fight: Max Holloway vs Dustin Poirier 2 | UFC 236"),
        video("CCCCCCCCCCC", "Free Fight: Max Holloway vs Dustin Poirier 3"),
    ]
    result = match_fights(fights, videos)
    assert result.matched == {"f1": "AAAAAAAAAAA", "f2": "BBBBBBBBBBB"}
    assert result.ambiguous == ["f3"]  # no event number: cannot tell, so no guess


def test_two_different_videos_for_one_fight_is_ambiguous() -> None:
    result = match_fights(
        [fight("f1", "Ann One", "Bea Two", "UFC 1: Test")],
        [
            video("AAAAAAAAAAA", "Free Fight: Ann One vs Bea Two"),
            video("BBBBBBBBBBB", "FULL FIGHT: Ann One vs Bea Two (Fight Pass)"),
        ],
    )
    assert result.matched == {} and result.ambiguous == ["f1"]


def test_a_reupload_with_the_same_title_picks_the_first_upload() -> None:
    result = match_fights(
        [fight("f1", "Ann One", "Bea Two", "UFC 1: Test")],
        [
            video(
                "BBBBBBBBBBB", "Free Fight: Ann One vs Bea Two", published="2022-01-01T00:00:00Z"
            ),
            video(
                "AAAAAAAAAAA", "Free Fight: Ann One vs Bea Two", published="2019-01-01T00:00:00Z"
            ),
        ],
    )
    assert result.matched == {"f1": "AAAAAAAAAAA"}


def test_names_match_with_accents_suffixes_and_surname_only_for_long_names() -> None:
    result = match_fights(
        [fight("f1", "Jiří Procházka", "Khalil Rountree Jr.", "UFC 320: Test")],
        [video("AAAAAAAAAAA", "Free Fight: Jiri Prochazka vs Khalil Rountree | UFC 320")],
    )
    assert result.matched == {"f1": "AAAAAAAAAAA"}


def test_event_number_reads_ufc_numbers_only() -> None:
    assert event_number("UFC 236: Holloway vs. Poirier 2") == "236"
    assert event_number("UFC Fight Night: Rosas Jr. vs. Barcelos") is None


def test_the_pipeline_links_matches_and_only_those_from_the_channel() -> None:
    repo = FakeRepository(
        rated=[
            RatedFight("f1", "Frankie Edgar", "Gray Maynard", "UFC 125: Resolution", 5.0),
            RatedFight("f2", "Ann One", "Bea Two", "UFC 9: Test", 4.5),
        ]
    )

    class Source:
        def uploads_playlist(self, handle: str) -> tuple[str, str]:
            return "UUplaylist", "UFC - Ultimate Fighting Championship"

        def list_videos(self, playlist_id: str, *, max_pages: int | None = None):
            yield video(
                "AAAAAAAAAAA",
                "Free Fight: Frankie Edgar vs Gray Maynard | UFC 125",
                channel="UFC - Ultimate Fighting Championship",
            )
            yield video(
                "ZZZZZZZZZZZ",
                "Free Fight: Frankie Edgar vs Gray Maynard | UFC 125",
                channel="Some Other Channel",
            )

    report = run_ingest_videos(Source(), repo, min_stars=5.0)
    assert repo.videos == {"f1": "AAAAAAAAAAA"}
    assert repo.video_channel == "UFC - Ultimate Fighting Championship"
    assert (report.fights, report.linked, report.missing) == (1, 1, 0)

    dry = FakeRepository(rated=repo.rated)
    run_ingest_videos(Source(), dry, min_stars=5.0, dry_run=True)
    assert dry.videos == {}


def _client(handler) -> YouTubeClient:
    return YouTubeClient(
        "SECRET-KEY",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
        interval_seconds=0,
    )


def test_the_client_reads_the_uploads_playlist_page_by_page() -> None:
    pages = {
        None: {
            "items": [
                {
                    "snippet": {
                        "title": "One",
                        "resourceId": {"videoId": "AAAAAAAAAAA"},
                        "videoOwnerChannelTitle": "UFC",
                        "publishedAt": "2020",
                    }
                }
            ],
            "nextPageToken": "T2",
        },
        "T2": {
            "items": [
                {
                    "snippet": {
                        "title": "Two",
                        "resourceId": {"videoId": "BBBBBBBBBBB"},
                        "channelTitle": "UFC",
                    }
                }
            ]
        },
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["key"] == "SECRET-KEY"
        return httpx.Response(200, json=pages[request.url.params.get("pageToken")])

    videos = list(_client(handler).list_videos("UUx"))
    assert [v.video_id for v in videos] == ["AAAAAAAAAAA", "BBBBBBBBBBB"]


def test_the_client_resolves_a_channel_handle() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["forHandle"] == "UFC"
        return httpx.Response(
            200,
            json={
                "items": [
                    {
                        "contentDetails": {"relatedPlaylists": {"uploads": "UUabc"}},
                        "snippet": {"title": "UFC"},
                    }
                ]
            },
        )

    assert _client(handler).uploads_playlist("@UFC") == ("UUabc", "UFC")


def test_errors_never_carry_the_key_or_the_url() -> None:
    def refused(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"error": {"errors": [{"reason": "quotaExceeded"}]}})

    with pytest.raises(YouTubeApiError) as caught:
        list(_client(refused).list_videos("UUx"))
    assert "quotaExceeded" in str(caught.value)
    assert "SECRET-KEY" not in str(caught.value) and "googleapis" not in str(caught.value)

    def broken(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom https://www.googleapis.com/?key=SECRET-KEY", request=request)

    with pytest.raises(YouTubeApiError) as caught2:
        list(_client(broken).list_videos("UUx"))
    assert "SECRET-KEY" not in str(caught2.value)
