"""migrate: ordered, recorded, never edited, never half applied."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Any

import pytest

from blindcard_ingest.migrate import (
    MIGRATIONS_DIR,
    Migration,
    MigrationError,
    load_migrations,
    migrate,
)


class FakeConn:
    """Records the SQL it is given; the ledger lives in a dict. `fail_on` makes that file fail."""

    def __init__(self, ledger: dict[str, str] | None = None, fail_on: str | None = None) -> None:
        self.ledger = dict(ledger or {})
        self.fail_on = fail_on
        self.ran: list[str] = []
        self._pending: dict[str, str] = {}
        self._in_tx = False
        self._last: list[tuple[str, str]] = []

    def execute(self, query: str, params: Any = None) -> Any:
        text = " ".join(query.split())
        if text.startswith("select name, checksum"):
            self._last = list(self.ledger.items())
            return self
        if text.startswith("insert into public.schema_migrations"):
            name, checksum = params
            (self._pending if self._in_tx else self.ledger)[name] = checksum
            return self
        if "create table if not exists public.schema_migrations" in text:
            return self
        if self.fail_on and self.fail_on in text:
            raise RuntimeError("boom with details that must not leak")
        self.ran.append(text)
        return self

    def fetchall(self) -> list[tuple[str, str]]:
        return self._last

    @contextmanager
    def transaction(self):  # type: ignore[no-untyped-def]
        self._in_tx, self._pending = True, {}
        try:
            yield
            self.ledger.update(self._pending)  # committed together
        finally:
            self._in_tx = False


def mig(n: int, sql: str = "") -> Migration:
    return Migration(n, f"{n:04d}_step_{n}.sql", sql or f"select {n};")


def test_every_real_migration_loads_in_order_without_gaps() -> None:
    migrations = load_migrations(MIGRATIONS_DIR)
    assert [m.number for m in migrations] == list(range(1, len(migrations) + 1))
    assert migrations[0].name.startswith("0001_")
    assert len(migrations) >= 19


def test_bad_names_gaps_and_repeats_are_refused(tmp_path: Path) -> None:
    (tmp_path / "0001_a.sql").write_text("select 1;")
    (tmp_path / "0003_c.sql").write_text("select 3;")
    with pytest.raises(MigrationError):
        load_migrations(tmp_path)
    (tmp_path / "0003_c.sql").rename(tmp_path / "notes.sql")
    with pytest.raises(MigrationError):
        load_migrations(tmp_path)


def test_new_migrations_run_in_order_and_are_recorded() -> None:
    conn = FakeConn()
    report = migrate(conn, [mig(1), mig(2), mig(3)])  # type: ignore[arg-type]
    assert report.applied == ["0001_step_1.sql", "0002_step_2.sql", "0003_step_3.sql"]
    assert conn.ran == ["select 1;", "select 2;", "select 3;"]
    assert set(conn.ledger) == {m.name for m in (mig(1), mig(2), mig(3))}


def test_a_second_run_applies_nothing() -> None:
    conn = FakeConn()
    ms = [mig(1), mig(2)]
    migrate(conn, ms)  # type: ignore[arg-type]
    conn.ran.clear()
    report = migrate(conn, ms)  # type: ignore[arg-type]
    assert report.applied == [] and report.already == 2 and conn.ran == []


def test_only_the_missing_ones_run_after_an_upgrade() -> None:
    conn = FakeConn()
    migrate(conn, [mig(1), mig(2)])  # type: ignore[arg-type]
    conn.ran.clear()
    report = migrate(conn, [mig(1), mig(2), mig(3)])  # type: ignore[arg-type]
    assert report.applied == ["0003_step_3.sql"] and conn.ran == ["select 3;"]


def test_an_applied_migration_that_was_edited_is_refused() -> None:
    conn = FakeConn()
    migrate(conn, [mig(1)])  # type: ignore[arg-type]
    with pytest.raises(MigrationError, match="changed since"):
        migrate(conn, [mig(1, "select 'edited';")])  # type: ignore[arg-type]


def test_a_database_with_migrations_the_repository_lacks_is_refused() -> None:
    conn = FakeConn({"0042_from_elsewhere.sql": "x"})
    with pytest.raises(MigrationError, match="0042_from_elsewhere"):
        migrate(conn, [mig(1)])  # type: ignore[arg-type]


def test_a_failing_migration_is_not_recorded_names_the_file_and_leaks_no_text() -> None:
    conn = FakeConn(fail_on="select 2;")
    with pytest.raises(MigrationError) as raised:
        migrate(conn, [mig(1), mig(2), mig(3)])  # type: ignore[arg-type]
    message = str(raised.value)
    assert "0002_step_2.sql" in message and "boom" not in message and "select" not in message
    assert set(conn.ledger) == {"0001_step_1.sql"}  # 1 stays done, 2 and 3 are not recorded
    assert conn.ran == ["select 1;"]


def test_a_dry_run_changes_and_records_nothing() -> None:
    conn = FakeConn()
    report = migrate(conn, [mig(1), mig(2)], dry_run=True)  # type: ignore[arg-type]
    assert report.applied == ["0001_step_1.sql", "0002_step_2.sql"]
    assert conn.ran == [] and conn.ledger == {}


def test_baselining_records_the_first_n_without_running_them() -> None:
    conn = FakeConn()
    report = migrate(conn, [mig(1), mig(2), mig(3)], baseline_through=2)  # type: ignore[arg-type]
    assert report.baselined == ["0001_step_1.sql", "0002_step_2.sql"]
    assert report.applied == ["0003_step_3.sql"]
    assert conn.ran == ["select 3;"] and len(conn.ledger) == 3


def test_baselining_is_only_for_an_empty_ledger() -> None:
    conn = FakeConn()
    migrate(conn, [mig(1)])  # type: ignore[arg-type]
    with pytest.raises(MigrationError, match="empty ledger"):
        migrate(conn, [mig(1), mig(2)], baseline_through=1)  # type: ignore[arg-type]
