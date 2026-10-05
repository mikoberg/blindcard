"""Runtime settings, read from the environment (optionally seeded from `ingest/.env`).

Secrets are never logged: `Settings.__repr__` hides the database URL.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

INGEST_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SCORING_CONFIG_DIR = INGEST_ROOT / "config"
DEFAULT_CACHE_DIR = INGEST_ROOT / ".cache" / "html"
USER_AGENT_PRODUCT = "BlindcardBot/0.1"


class SettingsError(RuntimeError):
    """A required setting is missing or invalid."""


def parse_dotenv(text: str) -> dict[str, str]:
    """Parse simple `KEY=VALUE` lines. Comments and blank lines are ignored."""
    values: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        values[key.strip()] = value
    return values


@dataclass(frozen=True)
class Settings:
    database_url: str | None = field(default=None, repr=False)
    scraper_contact: str | None = None
    youtube_api_key: str | None = field(default=None, repr=False)
    cache_dir: Path = DEFAULT_CACHE_DIR
    request_interval_seconds: float = 1.0
    log_level: str = "INFO"
    scoring_config_dir: Path = DEFAULT_SCORING_CONFIG_DIR

    def require_database_url(self) -> str:
        if not self.database_url:
            raise SettingsError("DATABASE_URL is not set (see .env.example).")
        return self.database_url

    def require_youtube_api_key(self) -> str:
        if not self.youtube_api_key:
            raise SettingsError("YOUTUBE_API_KEY is not set (see .env.example).")
        return self.youtube_api_key

    def require_user_agent(self) -> str:
        """The scraper identifies itself; refuse to fetch anything without a contact."""
        if not self.scraper_contact:
            raise SettingsError(
                "SCRAPER_CONTACT is not set. Scraping requires an identifying contact "
                "(project URL or dedicated address) for the User-Agent; see .env.example."
            )
        return f"{USER_AGENT_PRODUCT} (+{self.scraper_contact})"


def load_settings(
    env: Mapping[str, str] | None = None, dotenv_path: Path | None = None
) -> Settings:
    """Build settings from `env` (default: os.environ), seeded by an optional .env file.

    Real environment variables win over values in the .env file.
    """
    merged: dict[str, str] = {}
    path = dotenv_path if dotenv_path is not None else INGEST_ROOT / ".env"
    if path.is_file():
        merged.update(parse_dotenv(path.read_text(encoding="utf-8")))
    merged.update(os.environ if env is None else env)

    interval_raw = merged.get("REQUEST_INTERVAL_SECONDS", "1.0")
    try:
        interval = float(interval_raw)
    except ValueError as exc:
        raise SettingsError(f"REQUEST_INTERVAL_SECONDS is not a number: {interval_raw!r}") from exc
    if interval < 1.0:
        raise SettingsError("REQUEST_INTERVAL_SECONDS must be at least 1.0 (polite scraping).")

    cache_raw = merged.get("CACHE_DIR")
    cache_dir = Path(cache_raw) if cache_raw else DEFAULT_CACHE_DIR
    if not cache_dir.is_absolute():
        cache_dir = INGEST_ROOT / cache_dir

    return Settings(
        database_url=merged.get("DATABASE_URL") or None,
        scraper_contact=merged.get("SCRAPER_CONTACT") or None,
        youtube_api_key=merged.get("YOUTUBE_API_KEY") or None,
        cache_dir=cache_dir,
        request_interval_seconds=interval,
        log_level=merged.get("LOG_LEVEL", "INFO").upper(),
    )
