import os
from pathlib import Path

import httpx
import pytest

from blindcard_ingest.http.cache import HtmlCache
from blindcard_ingest.http.client import FetchError, PoliteClient

URL = "http://example.test/statistics/events/completed"


class FakeClock:
    """Deterministic clock whose `sleep` advances time, so no test really waits."""

    def __init__(self) -> None:
        self.now = 1000.0
        self.sleeps: list[float] = []

    def clock(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def make_client(
    tmp_path: Path, handler: httpx.MockTransport, clock: FakeClock, **kwargs: object
) -> PoliteClient:
    return PoliteClient(
        "BlindcardBot/0.1 (+test)",
        HtmlCache(tmp_path),
        transport=handler,
        sleep=clock.sleep,
        clock=clock.clock,
        **kwargs,  # type: ignore[arg-type]
    )


def test_sends_identifying_user_agent_and_returns_body(tmp_path: Path) -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers["user-agent"])
        return httpx.Response(200, text="<html>ok</html>")

    clock = FakeClock()
    with make_client(tmp_path, httpx.MockTransport(handler), clock) as client:
        assert client.get_html(URL) == "<html>ok</html>"
    assert seen == ["BlindcardBot/0.1 (+test)"]


def test_second_call_is_served_from_cache(tmp_path: Path) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, text="body")

    clock = FakeClock()
    with make_client(tmp_path, httpx.MockTransport(handler), clock) as client:
        client.get_html(URL)
        client.get_html(URL)
    assert calls == 1


def test_max_age_zero_forces_refetch(tmp_path: Path) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, text=f"v{calls}")

    clock = FakeClock()
    with make_client(tmp_path, httpx.MockTransport(handler), clock) as client:
        assert client.get_html(URL) == "v1"
        assert client.get_html(URL, max_age_seconds=0) == "v2"


def test_stale_cache_is_refetched_and_fresh_cache_is_not(tmp_path: Path) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, text="body")

    cache = HtmlCache(tmp_path, now=lambda: 5000.0)
    cache.put(URL, "cached")
    path = next(tmp_path.glob("*.html"))

    clock = FakeClock()
    client = PoliteClient(
        "ua", cache, transport=httpx.MockTransport(handler), sleep=clock.sleep, clock=clock.clock
    )
    os.utime(path, (4900.0, 4900.0))  # 100 s old
    assert client.get_html(URL, max_age_seconds=3600) == "cached"
    assert calls == 0
    assert client.get_html(URL, max_age_seconds=50) == "body"
    assert calls == 1
    client.close()


def test_invalidate_drops_the_cached_page(tmp_path: Path) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, text="body")

    clock = FakeClock()
    with make_client(tmp_path, httpx.MockTransport(handler), clock) as client:
        client.get_html(URL)
        client.invalidate(URL)
        client.get_html(URL)
    assert calls == 2


def test_requests_are_spaced_at_least_the_minimum_interval(tmp_path: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="x")

    clock = FakeClock()
    with make_client(tmp_path, httpx.MockTransport(handler), clock) as client:
        client.get_html("http://example.test/a")
        client.get_html("http://example.test/b")
        client.get_html("http://example.test/c")
    assert clock.sleeps == [1.0, 1.0]


def test_retries_on_503_then_succeeds(tmp_path: Path) -> None:
    responses = iter([503, 503, 200])

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(next(responses), text="finally")

    clock = FakeClock()
    with make_client(tmp_path, httpx.MockTransport(handler), clock) as client:
        assert client.get_html(URL) == "finally"
    assert 2.0 in clock.sleeps and 4.0 in clock.sleeps  # exponential backoff


def test_retry_after_header_is_honoured_and_capped(tmp_path: Path) -> None:
    responses = iter([429, 200])

    def handler(request: httpx.Request) -> httpx.Response:
        status = next(responses)
        headers = {"Retry-After": "9999"} if status == 429 else {}
        return httpx.Response(status, text="ok", headers=headers)

    clock = FakeClock()
    with make_client(tmp_path, httpx.MockTransport(handler), clock) as client:
        client.get_html(URL)
    assert 60.0 in clock.sleeps


def test_404_is_not_retried(tmp_path: Path) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(404, text="nope")

    clock = FakeClock()
    with (
        make_client(tmp_path, httpx.MockTransport(handler), clock) as client,
        pytest.raises(FetchError) as excinfo,
    ):
        client.get_html(URL)
    assert calls == 1
    assert excinfo.value.status_code == 404


def test_gives_up_after_max_retries(tmp_path: Path) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(500, text="boom")

    clock = FakeClock()
    with (
        make_client(tmp_path, httpx.MockTransport(handler), clock, max_retries=2) as client,
        pytest.raises(FetchError),
    ):
        client.get_html(URL)
    assert calls == 3  # first attempt + 2 retries


def test_transport_errors_are_retried_then_raised(tmp_path: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    clock = FakeClock()
    with (
        make_client(tmp_path, httpx.MockTransport(handler), clock, max_retries=1) as client,
        pytest.raises(FetchError, match="network error"),
    ):
        client.get_html(URL)


CHALLENGE = (
    "<!doctype html><html><head><title>Loading…</title></head><body>"
    "<p>Checking your browser…</p><noscript>This site requires JavaScript.</noscript>"
    "<script>/* proof of work */</script></body></html>"
)


def test_bot_check_page_is_refused_not_cached_and_not_retried(tmp_path: Path) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, text=CHALLENGE)

    clock = FakeClock()
    with (
        make_client(tmp_path, httpx.MockTransport(handler), clock) as client,
        pytest.raises(FetchError, match="bot-check"),
    ):
        client.get_html(URL)
    assert calls == 1
    assert list(tmp_path.glob("*.html")) == []


def test_failed_fetch_is_not_cached(tmp_path: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    clock = FakeClock()
    with (
        make_client(tmp_path, httpx.MockTransport(handler), clock) as client,
        pytest.raises(FetchError),
    ):
        client.get_html(URL)
    assert list(tmp_path.glob("*.html")) == []
