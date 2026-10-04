import contextlib
import datetime as dt
from collections.abc import Sequence
from pathlib import Path

import pytest
from fakes import FakeRepository, FakeSource, make_bundle

from blindcard_ingest import cli
from blindcard_ingest.pipeline import DEFAULT_SINCE_DAYS
from blindcard_ingest.settings import DEFAULT_SCORING_CONFIG_DIR, Settings


@pytest.fixture
def isolated_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """No real .env or environment may leak into CLI tests."""
    for name in ("DATABASE_URL", "SCRAPER_CONTACT", "CACHE_DIR", "LOG_LEVEL"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr("blindcard_ingest.settings.INGEST_ROOT", tmp_path)


def patch_backends(
    monkeypatch: pytest.MonkeyPatch, repo: FakeRepository, source: FakeSource
) -> None:
    @contextlib.contextmanager
    def open_repo(_settings: Settings):  # type: ignore[no-untyped-def]
        yield repo

    @contextlib.contextmanager
    def open_source(_settings: Settings):  # type: ignore[no-untyped-def]
        yield source

    monkeypatch.setattr(cli, "_open_repository", open_repo)
    monkeypatch.setattr(cli, "_open_source", open_source)
    monkeypatch.setattr(cli, "_today", lambda: dt.date(2026, 10, 4))


def test_parser_requires_a_command_and_the_year() -> None:
    parser = cli.build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args([])
    with pytest.raises(SystemExit):
        parser.parse_args(["backfill"])
    args = parser.parse_args(["backfill", "--from", "2015", "--dry-run"])
    assert (args.command, args.from_year, args.dry_run) == ("backfill", 2015, True)


def test_ingest_latest_defaults() -> None:
    args = cli.build_parser().parse_args(["ingest-latest"])
    assert (args.since_days, args.dry_run) == (DEFAULT_SINCE_DAYS, False)


def test_rescore_needs_a_version() -> None:
    parser = cli.build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args(["rescore"])
    args = parser.parse_args(["rescore", "--version", "2", "--activate"])
    assert (args.version, args.activate) == (2, True)


def test_scraping_commands_refuse_to_run_without_a_contact(
    isolated_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://example/db")
    assert cli.main(["backfill", "--from", "2024"]) == cli.EXIT_BAD_CONFIG
    assert cli.main(["ingest-latest"]) == cli.EXIT_BAD_CONFIG


def test_commands_need_a_database_url(isolated_env: None) -> None:
    assert cli.main(["rescore", "--version", "1"]) == cli.EXIT_BAD_CONFIG


def test_backfill_runs_and_reports_success(
    isolated_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://example/db")
    monkeypatch.setenv("SCRAPER_CONTACT", "https://example.org/contact")
    repo = FakeRepository()
    source = FakeSource([make_bundle("e1", dt.date(2024, 5, 1), seed=1)])
    patch_backends(monkeypatch, repo, source)

    assert cli.main(["backfill", "--from", "2020"]) == cli.EXIT_OK
    assert ("fakesource", "e1") in repo.events


def test_ingest_latest_exits_nonzero_when_the_run_has_errors(
    isolated_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://example/db")
    monkeypatch.setenv("SCRAPER_CONTACT", "https://example.org/contact")
    repo = FakeRepository()  # no active score version -> an error is reported
    source = FakeSource([make_bundle("new", dt.date(2026, 10, 3))])
    patch_backends(monkeypatch, repo, source)

    assert cli.main(["ingest-latest"]) == cli.EXIT_RUN_ERRORS


def test_dry_run_writes_nothing(isolated_env: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://example/db")
    monkeypatch.setenv("SCRAPER_CONTACT", "https://example.org/contact")
    repo = FakeRepository()
    source = FakeSource([make_bundle("e1", dt.date(2024, 5, 1))])
    patch_backends(monkeypatch, repo, source)

    assert cli.main(["backfill", "--from", "2020", "--dry-run"]) == cli.EXIT_OK
    assert repo.events == {}


def test_rescore_uses_the_configured_scoring_directory(
    isolated_env: None, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://example/db")
    repo = FakeRepository()
    for i in range(120):
        repo.upsert_event_bundle(
            "fakesource", "UFC", make_bundle(f"h{i}", dt.date(2020, 1, 1), fights=1, seed=i)
        )
    patch_backends(monkeypatch, repo, FakeSource([]))
    assert DEFAULT_SCORING_CONFIG_DIR.joinpath("scoring_v1.toml").is_file()

    assert cli.main(["rescore", "--version", "1"]) == cli.EXIT_OK
    assert repo.active_version == 1
    assert len(repo.scores) == 120


def test_unknown_scoring_version_is_a_config_error(
    isolated_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://example/db")
    patch_backends(monkeypatch, FakeRepository(), FakeSource([]))
    assert cli.main(["rescore", "--version", "99"]) == cli.EXIT_BAD_CONFIG


class _EmptyWikipedia:
    """A Wikipedia that knows no events: every event ends up 'not labelled'."""

    def events_list_wikitext(self) -> str:
        return "==Past events==\n{|\n|}\n"

    def page_wikitexts(self, titles: Sequence[str]) -> dict[str, str]:
        return {}


def test_ingest_bonuses_refuses_to_run_without_a_contact(
    isolated_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://example/db")
    assert cli.main(["ingest-bonuses"]) == cli.EXIT_BAD_CONFIG


def test_ingest_bonuses_runs_and_never_fails_on_low_coverage(
    isolated_env: None, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://example/db")
    monkeypatch.setenv("SCRAPER_CONTACT", "https://example.org/contact")
    repo = FakeRepository()
    repo.upsert_event_bundle("ufcstats", "UFC", make_bundle("e1", dt.date(2024, 5, 4), seed=1))
    patch_backends(monkeypatch, repo, FakeSource([]))

    @contextlib.contextmanager
    def open_wikipedia(_settings: Settings):  # type: ignore[no-untyped-def]
        yield _EmptyWikipedia()

    monkeypatch.setattr(cli, "_open_wikipedia", open_wikipedia)

    assert (
        cli.main(["ingest-bonuses", "--from", "2020", "--cache-dir", str(tmp_path / "html")]) == 0
    )
    assert repo.bonuses == {}
    assert (tmp_path / "bonus_report.json").is_file()  # the local report sits beside the cache
