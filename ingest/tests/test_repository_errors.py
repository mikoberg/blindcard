"""Database errors must reach the logs without row data (Postgres puts the failing row there)."""

import psycopg
import pytest

from blindcard_ingest.db.repository import (
    RepositoryError,
    describe_db_error,
    sanitized_db_errors,
)

SECRET = 'Failing row contains (fight1, win, fighter-b, "KO/TKO", 2, 123)'


def test_describe_keeps_only_the_sqlstate_and_never_the_message() -> None:
    text = describe_db_error(psycopg.errors.CheckViolation(SECRET))
    assert text == "database error 23514"
    assert "KO/TKO" not in text


def test_wrapper_replaces_the_error_and_hides_the_original() -> None:
    with pytest.raises(RepositoryError) as excinfo, sanitized_db_errors():
        raise psycopg.errors.CheckViolation(SECRET)

    assert str(excinfo.value) == "database error 23514"
    assert excinfo.value.__cause__ is None
    assert excinfo.value.__suppress_context__ is True


def test_wrapper_leaves_other_errors_alone() -> None:
    with pytest.raises(KeyError), sanitized_db_errors():
        raise KeyError("not a database error")
