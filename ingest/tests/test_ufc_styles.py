"""Styles from the official athlete pages: one field, slowly, only for the right person."""

from __future__ import annotations

import pytest
from fakes import FakeRepository

from blindcard_ingest.db.repository import StyleCandidate
from blindcard_ingest.http.client import FetchError
from blindcard_ingest.sources.ufc.athlete import UfcAthletes, athlete_slug, parse_athlete
from blindcard_ingest.sources.ufc.event_times import RobotsRefused
from blindcard_ingest.ufc_styles_pipeline import run_ingest_ufc_styles


def page(name: str, style: str | None) -> str:
    bio = (
        f'<div class="c-bio__field"><div class="c-bio__label">Fighting style</div>'
        f'<div class="c-bio__text">{style}</div></div>'
        if style is not None
        else ""
    )
    return (
        f"<html><head><title>{name} | UFC</title></head><body>"
        '<div class="c-bio__label">Status</div><div class="c-bio__text">Active</div>'
        f"{bio}</body></html>"
    )


def test_the_slug_follows_the_sites_rule() -> None:
    assert athlete_slug("Raul Rosas Jr.") == "raul-rosas-jr"
    assert athlete_slug("Lone'er Kavanagh") == "loneer-kavanagh"
    assert athlete_slug("Kai Kamaka III") == "kai-kamaka-iii"
    assert athlete_slug("Natália Silva") == "natalia-silva"


def test_one_field_is_read_and_reduced_to_labels() -> None:
    assert parse_athlete(page("Merab Dvalishvili", "Freestyle")) == (
        "Merab Dvalishvili",
        ["Wrestling"],
    )
    assert parse_athlete(page("Raoni Barcelos", "Jiu-Jitsu"))[1] == ["Brazilian jiu-jitsu"]
    assert parse_athlete(page("Kai Kamaka III", "Boxing"))[1] == ["Boxing"]
    # "MMA" and a missing field say nothing
    assert parse_athlete(page("Jai Herbert", "MMA")) == ("Jai Herbert", [])
    assert parse_athlete(page("Alexander Volkanovski", None)) == ("Alexander Volkanovski", [])
    assert parse_athlete("<html>no title</html>") == (None, [])


class FakeClient:
    def __init__(
        self, pages: dict[str, str | Exception], robots: str = "User-agent: *\ncrawl-delay: 15\n"
    ) -> None:
        self.pages, self.robots = pages, robots
        self.fetched: list[str] = []

    def get_html(self, url: str, *, max_age_seconds: float | None = None) -> str:
        self.fetched.append(url)
        if url.endswith("/robots.txt"):
            return self.robots
        value = self.pages.get(url)
        if value is None or isinstance(value, Exception):
            raise value or FetchError(url, "missing")
        return value


def athletes(pages: dict[str, str | Exception], robots: str | None = None) -> UfcAthletes:
    client = FakeClient(pages, robots) if robots is not None else FakeClient(pages)
    return UfcAthletes(client, "BlindcardBot/0.1")  # type: ignore[arg-type]


def test_a_page_counts_only_when_its_title_is_the_fighters_name() -> None:
    site = athletes(
        {
            "https://www.ufc.com/athlete/merab-dvalishvili": page("Merab Dvalishvili", "Freestyle"),
            "https://www.ufc.com/athlete/michael-johnson": page("Michael Johnson", "Boxing"),
        }
    )
    assert site.style_of("Merab Dvalishvili") == ["Wrestling"]
    reversed_title = athletes(
        {"https://www.ufc.com/athlete/merab-dvalishvili": page("Dvalishvili Merab", "Freestyle")}
    )
    assert reversed_title.style_of("Merab Dvalishvili") == [
        "Wrestling"
    ]  # the name in the other order
    assert site.style_of("Michael Johnson Jr") is None  # no page for that slug
    other = athletes(
        {"https://www.ufc.com/athlete/bruno-silva": page("Bruno Silva Rodrigues", "Boxing")}
    )
    assert other.style_of("Bruno Silva") is None  # a different person's page is never used


def test_a_missing_page_or_a_failed_fetch_gives_none_and_robots_is_obeyed() -> None:
    site = athletes({"https://www.ufc.com/athlete/x-y": FetchError("u", "boom")})
    assert site.style_of("X Y") is None
    deny = athletes({}, robots="User-agent: *\nDisallow: /athlete/\n")
    with pytest.raises(RobotsRefused):
        deny.style_of("Merab Dvalishvili")
    assert not any("/athlete/" in url for url in deny._client.fetched)  # type: ignore[attr-defined]


class FakeAthletes:
    def __init__(self, styles: dict[str, list[str] | None]) -> None:
        self.styles = styles
        self.asked: list[str] = []

    def style_of(self, name: str) -> list[str] | None:
        self.asked.append(name)
        return self.styles.get(name)


def test_each_fighter_asked_is_marked_whatever_came_back() -> None:
    repo = FakeRepository(
        style_candidates=[
            StyleCandidate("id1", "Merab Dvalishvili"),
            StyleCandidate("id2", "Jai Herbert"),
            StyleCandidate("id3", "No Page"),
        ]
    )
    site = FakeAthletes({"Merab Dvalishvili": ["Wrestling"], "Jai Herbert": []})
    report = run_ingest_ufc_styles(repo, site, limit=10)
    assert (report.asked, report.with_style, report.no_page) == (3, 1, 1)
    assert repo.ufc_styles == {"id1": ["Wrestling"], "id2": None, "id3": None}


def test_the_limit_and_a_dry_run_and_a_robots_refusal() -> None:
    cands = [StyleCandidate(f"id{i}", f"Fighter {i}") for i in range(5)]
    repo = FakeRepository(style_candidates=cands)
    site = FakeAthletes({})
    run_ingest_ufc_styles(repo, site, limit=2)
    assert site.asked == ["Fighter 0", "Fighter 1"]
    dry = FakeRepository(style_candidates=cands)
    run_ingest_ufc_styles(dry, FakeAthletes({}), limit=2, dry_run=True)
    assert dry.ufc_styles == {}

    class Refusing:
        def style_of(self, name: str) -> list[str] | None:
            raise RobotsRefused("no")

    stopped = FakeRepository(style_candidates=cands)
    report = run_ingest_ufc_styles(stopped, Refusing(), limit=5)
    assert report.stopped_by_robots and report.asked == 0 and stopped.ufc_styles == {}
