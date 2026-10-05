"""migrate: apply supabase/migrations in order, with a ledger of what has been applied.

Each migration runs in its own transaction together with its ledger row, so a failure leaves the
database exactly as it was before that file. A migration that is already in the ledger is never run
again, and its file must not have changed since (its checksum is kept): migrations are history.

`--baseline-through N` is for a database that was set up by hand before this ledger existed: it
records the files up to number N as applied WITHOUT running them. Only use it when those files
really are in the database.

Logs and output carry file names and counts only, never SQL or row data.
"""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from blindcard_ingest.settings import INGEST_ROOT

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = INGEST_ROOT.parent / "supabase" / "migrations"
_NAME = re.compile(r"^(\d{4})_[a-z0-9_]+\.sql$")

LEDGER_SQL = """
create table if not exists public.schema_migrations (
  name text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from public, anon, authenticated;
"""


class MigrationError(RuntimeError):
    """The migrations cannot be applied safely. The message names files, never SQL."""


@dataclass(frozen=True)
class Migration:
    number: int
    name: str
    sql: str

    @property
    def checksum(self) -> str:
        return hashlib.sha256(self.sql.encode("utf-8")).hexdigest()


def load_migrations(directory: Path = MIGRATIONS_DIR) -> list[Migration]:
    """All migration files, in order. Names must be NNNN_words.sql, numbers unique and gap-free."""
    migrations: list[Migration] = []
    for path in sorted(directory.glob("*.sql")):
        match = _NAME.match(path.name)
        if match is None:
            raise MigrationError(f"{path.name}: not named NNNN_some_words.sql")
        migrations.append(
            Migration(int(match.group(1)), path.name, path.read_text(encoding="utf-8"))
        )
    numbers = [m.number for m in migrations]
    if numbers != list(range(1, len(numbers) + 1)):
        raise MigrationError(f"migration numbers are not 1..{len(numbers)} without gaps or repeats")
    return migrations


class Connection(Protocol):
    def execute(self, query: str, params: Any = ...) -> Any: ...

    def transaction(self) -> Any: ...


@dataclass
class MigrateReport:
    applied: list[str] = field(default_factory=list)
    baselined: list[str] = field(default_factory=list)
    already: int = 0


def migrate(
    conn: Connection,
    migrations: list[Migration],
    *,
    baseline_through: int | None = None,
    dry_run: bool = False,
) -> MigrateReport:
    report = MigrateReport()
    conn.execute(LEDGER_SQL)
    rows = conn.execute("select name, checksum from public.schema_migrations").fetchall()
    ledger = {row[0] if not isinstance(row, dict) else row["name"]: row for row in rows}
    stored = {
        name: (row[1] if not isinstance(row, dict) else row["checksum"])
        for name, row in ledger.items()
    }
    known = {m.name for m in migrations}
    unknown = sorted(set(stored) - known)
    if unknown:
        raise MigrationError(
            f"the database has migrations this repository does not: {', '.join(unknown)}"
        )
    for m in migrations:
        if m.name in stored:
            if stored[m.name] != m.checksum:
                raise MigrationError(
                    f"{m.name} was applied and has been changed since; never edit a migration"
                )
            report.already += 1
    if baseline_through is not None and stored:
        raise MigrationError("--baseline-through is only for a database with an empty ledger")
    for m in migrations:
        if m.name in stored:
            continue
        if baseline_through is not None and m.number <= baseline_through:
            report.baselined.append(m.name)
            if not dry_run:
                conn.execute(
                    "insert into public.schema_migrations (name, checksum) values (%s, %s)",
                    (m.name, m.checksum),
                )
            continue
        report.applied.append(m.name)
        if dry_run:
            continue
        try:
            with conn.transaction():
                conn.execute(m.sql)
                conn.execute(
                    "insert into public.schema_migrations (name, checksum) values (%s, %s)",
                    (m.name, m.checksum),
                )
        except Exception as exc:  # noqa: BLE001 - rethrown with the file name, without SQL text
            raise MigrationError(
                f"{m.name} failed ({type(exc).__name__}); nothing of it was applied"
            ) from None
        logger.info("migrate: applied %s", m.name)
    return report
