"""rls-test runner: it owns the transaction and never touches DATABASE_URL."""

from __future__ import annotations

from pathlib import Path

import pytest

from blindcard_ingest.rls_check import RLS_SQL, RlsResult, script_body
from blindcard_ingest.settings import SettingsError, load_settings


def test_the_script_body_drops_its_own_transaction_and_psql_only_lines() -> None:
    body = script_body(RLS_SQL)
    lowered = [line.strip().lower() for line in body.splitlines()]
    assert "begin;" not in lowered and "rollback;" not in lowered
    assert not any(line.startswith("\echo") for line in body.splitlines())
    assert "set local role anon" in body.lower()  # the real assertions are still there


def test_a_custom_script_is_handled_the_same_way(tmp_path: Path) -> None:
    path = tmp_path / "t.sql"
    path.write_text("begin;\n\echo hi\nselect 1;\nrollback;\n")
    assert script_body(path).strip() == "select 1;"


def test_a_result_is_ok_only_with_passes_and_no_error() -> None:
    assert RlsResult(passed=["PASS a"]).ok
    assert not RlsResult(passed=[]).ok
    assert not RlsResult(passed=["PASS a"], error="boom").ok


def test_the_throwaway_database_is_its_own_setting_never_the_live_one() -> None:
    only_live = load_settings({"DATABASE_URL": "postgres://live"}, dotenv_path=Path("none.env"))
    with pytest.raises(SettingsError, match="TEST_DATABASE_URL"):
        only_live.require_test_database_url()
    both = load_settings(
        {"DATABASE_URL": "postgres://live", "TEST_DATABASE_URL": "postgres://throwaway"},
        dotenv_path=Path("none.env"),
    )
    assert both.require_test_database_url() == "postgres://throwaway"
