from pathlib import Path

import pytest

from blindcard_ingest.settings import SettingsError, load_settings, parse_dotenv


def test_parse_dotenv_ignores_comments_and_strips_quotes() -> None:
    text = '# comment\n\nDATABASE_URL="postgres://x"\nSCRAPER_CONTACT=me@example.org\nBAD LINE\n'
    assert parse_dotenv(text) == {
        "DATABASE_URL": "postgres://x",
        "SCRAPER_CONTACT": "me@example.org",
    }


def test_user_agent_requires_contact(tmp_path: Path) -> None:
    settings = load_settings(env={}, dotenv_path=tmp_path / "missing.env")
    with pytest.raises(SettingsError, match="SCRAPER_CONTACT"):
        settings.require_user_agent()


def test_user_agent_identifies_the_bot(tmp_path: Path) -> None:
    settings = load_settings(
        env={"SCRAPER_CONTACT": "https://example.org/blindcard"},
        dotenv_path=tmp_path / "missing.env",
    )
    assert settings.require_user_agent() == "BlindcardBot/0.1 (+https://example.org/blindcard)"


def test_env_wins_over_dotenv_file(tmp_path: Path) -> None:
    dotenv = tmp_path / ".env"
    dotenv.write_text("LOG_LEVEL=debug\nSCRAPER_CONTACT=from-file\n", encoding="utf-8")
    settings = load_settings(env={"LOG_LEVEL": "warning"}, dotenv_path=dotenv)
    assert settings.log_level == "WARNING"
    assert settings.scraper_contact == "from-file"


def test_request_interval_below_one_second_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(SettingsError, match="at least 1.0"):
        load_settings(env={"REQUEST_INTERVAL_SECONDS": "0.2"}, dotenv_path=tmp_path / "x.env")


def test_repr_hides_database_url(tmp_path: Path) -> None:
    settings = load_settings(
        env={"DATABASE_URL": "postgres://user:secret@host/db"}, dotenv_path=tmp_path / "x.env"
    )
    assert "secret" not in repr(settings)
    assert settings.require_database_url().endswith("/db")
