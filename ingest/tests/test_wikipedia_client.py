import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from blindcard_ingest.http.cache import HtmlCache
from blindcard_ingest.http.client import PoliteClient
from blindcard_ingest.sources.wikipedia.client import (
    BATCH_SIZE,
    WikipediaClient,
    WikipediaError,
)


class FakeWikipedia:
    def __init__(self) -> None:
        self.requests: list[dict[str, list[str]]] = []
        self.pages: dict[str, str] = {}
        self.redirects: dict[str, str] = {}
        self.normalized: dict[str, str] = {}
        self.error: dict[str, str] | None = None
        self.raw_body: str | None = None

    def __call__(self, request: httpx.Request) -> httpx.Response:
        params = parse_qs(urlsplit(str(request.url)).query)
        self.requests.append(params)
        if self.raw_body is not None:
            return httpx.Response(200, text=self.raw_body)
        if self.error:
            return httpx.Response(200, json={"error": self.error})
        if params["action"] == ["parse"]:
            return httpx.Response(200, json={"parse": {"wikitext": "LIST WIKITEXT"}})
        titles = params["titles"][0].split("|")
        pages = []
        for requested in titles:
            normalized = self.normalized.get(requested, requested)
            final = self.redirects.get(normalized, normalized)
            if final in self.pages:
                pages.append(
                    {
                        "title": final,
                        "revisions": [{"slots": {"main": {"content": self.pages[final]}}}],
                    }
                )
            else:
                pages.append({"title": final, "missing": True})
        return httpx.Response(
            200,
            json={
                "query": {
                    "normalized": [{"from": a, "to": b} for a, b in self.normalized.items()],
                    "redirects": [{"from": a, "to": b} for a, b in self.redirects.items()],
                    "pages": pages,
                }
            },
        )


def make(tmp_path: Path, fake: FakeWikipedia) -> WikipediaClient:
    http = PoliteClient(
        "BlindcardBot/0.1 (+test)",
        HtmlCache(tmp_path),
        min_interval_seconds=0.0,
        transport=httpx.MockTransport(fake),
        sleep=lambda _s: None,
    )
    return WikipediaClient(http)


def test_events_list_is_read_through_the_parse_action(tmp_path: Path) -> None:
    fake = FakeWikipedia()
    assert make(tmp_path, fake).events_list_wikitext() == "LIST WIKITEXT"
    params = fake.requests[0]
    assert params["page"] == ["List_of_UFC_events"]
    assert params["maxlag"] == ["5"]  # back off when the servers are busy


def test_pages_come_back_per_requested_title_through_normalisation_and_redirects(
    tmp_path: Path,
) -> None:
    fake = FakeWikipedia()
    fake.pages = {"UFC 300": "wikitext 300", "UFC Fight Night 1": "wikitext fn1"}
    fake.normalized = {"UFC_300": "UFC 300"}
    fake.redirects = {"UFC FN 1": "UFC Fight Night 1"}

    result = make(tmp_path, fake).page_wikitexts(["UFC_300", "UFC FN 1", "UFC 999"])

    assert result == {"UFC_300": "wikitext 300", "UFC FN 1": "wikitext fn1"}  # missing page absent
    params = fake.requests[0]
    assert params["redirects"] == ["1"]
    assert params["rvslots"] == ["main"]


def test_pages_are_fetched_in_batches_of_fifty_titles(tmp_path: Path) -> None:
    fake = FakeWikipedia()
    titles = [f"UFC {n}" for n in range(BATCH_SIZE * 2 + 3)]
    fake.pages = {t: f"text {t}" for t in titles}

    result = make(tmp_path, fake).page_wikitexts(titles)

    assert len(result) == len(titles)
    sizes = [len(p["titles"][0].split("|")) for p in fake.requests]
    assert sizes == [BATCH_SIZE, BATCH_SIZE, 3]


def test_a_second_run_is_served_from_the_cache(tmp_path: Path) -> None:
    fake = FakeWikipedia()
    fake.pages = {"UFC 1": "x"}
    make(tmp_path, fake).page_wikitexts(["UFC 1"])
    make(tmp_path, fake).page_wikitexts(["UFC 1"])
    assert len(fake.requests) == 1


def test_an_api_error_is_reported_without_guessing(tmp_path: Path) -> None:
    fake = FakeWikipedia()
    fake.error = {"code": "maxlag", "info": "Waiting for a database server"}
    with pytest.raises(WikipediaError, match="maxlag"):
        make(tmp_path, fake).page_wikitexts(["UFC 1"])


def test_a_non_json_answer_is_an_error(tmp_path: Path) -> None:
    fake = FakeWikipedia()
    fake.raw_body = "<html>oops</html>"
    with pytest.raises(WikipediaError, match="JSON"):
        make(tmp_path, fake).events_list_wikitext()
    fake.raw_body = json.dumps(["not", "a", "dict"])
    with pytest.raises(WikipediaError):
        make(tmp_path / "other", fake).events_list_wikitext()
