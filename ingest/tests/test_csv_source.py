import json
from pathlib import Path

import httpx
import pytest

from blindcard_ingest.http.cache import HtmlCache
from blindcard_ingest.http.client import PoliteClient
from blindcard_ingest.sources.ufcstats.dataset import DatasetError
from blindcard_ingest.sources.ufcstats.source import UfcStatsCsvSource

CSV_DIR = Path(__file__).parent / "fixtures" / "csv"
SHA = "0123456789abcdef0123456789abcdef01234567"
NEW_SHA = "fedcba9876543210fedcba9876543210fedcba98"
ROSAS = "7e654edcddd71550"


class FakeGitHub:
    """Serves the commits API and raw files, and records every requested URL."""

    def __init__(self, sha: str = SHA) -> None:
        self.sha = sha
        self.requests: list[str] = []
        self.commits_body: str | None = None

    def __call__(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        self.requests.append(url)
        if "api.github.com" in url and "/commits" in url:
            body = self.commits_body or json.dumps([{"sha": self.sha}])
            return httpx.Response(200, text=body)
        for name in ("ufc_event_details", "ufc_fight_results", "ufc_fight_stats"):
            if url.endswith(f"/{self.sha}/{name}.csv"):
                short = {"ufc_event_details": "events", "ufc_fight_results": "results"}.get(
                    name, "stats"
                )
                return httpx.Response(200, text=(CSV_DIR / f"{short}.csv").read_text("utf-8"))
        return httpx.Response(404)


def make_source(tmp_path: Path, github: FakeGitHub) -> UfcStatsCsvSource:
    client = PoliteClient(
        "BlindcardBot/0.1 (+test)",
        HtmlCache(tmp_path),
        min_interval_seconds=0.0,
        transport=httpx.MockTransport(github),
        sleep=lambda _s: None,
    )
    return UfcStatsCsvSource(client)


def test_reads_every_file_from_one_pinned_commit(tmp_path: Path) -> None:
    github = FakeGitHub()
    source = make_source(tmp_path, github)

    events = source.list_completed_events()

    assert len(events) == 7
    assert source.snapshot_sha == SHA
    raw = [u for u in github.requests if "raw.githubusercontent.com" in u]
    assert len(raw) == 3
    assert all(f"/{SHA}/" in u and "/main/" not in u for u in raw)


def test_fetch_event_returns_the_event_with_its_fights(tmp_path: Path) -> None:
    source = make_source(tmp_path, FakeGitHub())
    rosas = next(e for e in source.list_completed_events() if e.source_id == ROSAS)

    bundle = source.fetch_event(rosas, refresh=True)

    assert len(bundle.fights) == 12
    assert source.name == "ufcstats"


def test_fetch_event_loads_lazily_and_does_not_reload(tmp_path: Path) -> None:
    github = FakeGitHub()
    source = make_source(tmp_path, github)
    events = source.list_completed_events()
    before = len(github.requests)

    source.fetch_event(events[0])
    source.fetch_event(events[1])

    assert len(github.requests) == before  # one snapshot per run


def test_list_completed_events_always_resolves_the_newest_snapshot(tmp_path: Path) -> None:
    github = FakeGitHub()
    source = make_source(tmp_path, github)
    source.list_completed_events()

    github.sha = NEW_SHA
    source.list_completed_events()

    assert source.snapshot_sha == NEW_SHA
    assert any(f"/{NEW_SHA}/" in u for u in github.requests)


def test_pinned_files_are_cached_so_a_rerun_downloads_nothing_new(tmp_path: Path) -> None:
    github = FakeGitHub()
    make_source(tmp_path, github).list_completed_events()
    first_run = len([u for u in github.requests if "raw.githubusercontent.com" in u])

    make_source(tmp_path, github).list_completed_events()
    second_run = len([u for u in github.requests if "raw.githubusercontent.com" in u])

    assert second_run == first_run == 3


def test_unknown_event_is_an_error(tmp_path: Path) -> None:
    source = make_source(tmp_path, FakeGitHub())
    events = source.list_completed_events()
    ghost = events[0].model_copy(update={"source_id": "doesnotexist"})
    with pytest.raises(DatasetError, match="not in snapshot"):
        source.fetch_event(ghost)


@pytest.mark.parametrize(
    "body",
    ["not json", "[]", json.dumps([{"nosha": 1}]), json.dumps([{"sha": "main"}]), "{}"],
)
def test_bad_commit_response_is_refused(tmp_path: Path, body: str) -> None:
    github = FakeGitHub()
    github.commits_body = body
    with pytest.raises(DatasetError):
        make_source(tmp_path, github).list_completed_events()
