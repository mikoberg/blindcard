"""rls-test: run supabase/tests/rls.sql against a THROWAWAY database and report each assertion.

The script seeds fake rows, flips the active score version and switches roles, all inside one
transaction that is always rolled back. It still takes locks and writes, so it must never be pointed
at the live database: it reads TEST_DATABASE_URL only (never DATABASE_URL) and says so.

Output carries only the names of the assertions (PASS lines) and, on failure, the first error.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from blindcard_ingest.settings import INGEST_ROOT

RLS_SQL = INGEST_ROOT.parent / "supabase" / "tests" / "rls.sql"


@dataclass
class RlsResult:
    passed: list[str] = field(default_factory=list)
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None and bool(self.passed)


def script_body(path: Path = RLS_SQL) -> str:
    """The test script without its own begin/rollback and psql-only lines: the runner owns the
    transaction and always rolls it back."""
    text = path.read_text(encoding="utf-8")
    text = "\n".join(line for line in text.splitlines() if not line.startswith("\\echo"))
    text = re.sub(r"(?im)^begin;\s*$", "", text, count=1)
    return re.sub(r"(?im)^rollback;\s*$", "", text)


def run_rls_test(conninfo: str, path: Path = RLS_SQL) -> RlsResult:
    import psycopg

    result = RlsResult()
    script = "begin;\n" + script_body(path) + "\nrollback;\n"
    with psycopg.connect(conninfo, autocommit=True, prepare_threshold=None) as conn:
        conn.add_notice_handler(lambda diag: result.passed.append(diag.message_primary or ""))
        try:
            conn.execute(script)
        except Exception as exc:  # noqa: BLE001
            conn.execute("rollback")
            # the database's own message names the failed assertion; it holds no row data
            result.error = f"{type(exc).__name__}: {str(exc)[:300]}"
    result.passed = [m for m in result.passed if m.startswith("PASS")]
    return result
