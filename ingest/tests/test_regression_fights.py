"""The fights the product owner agreed were rated too low, and the check that keeps them there."""

from __future__ import annotations

import datetime as dt

import pytest

from blindcard_ingest.audit import RegressionCase, check_regressions, load_regression_cases
from blindcard_ingest.settings import INGEST_ROOT

CASES_FILE = INGEST_ROOT / "config" / "regression_fights.toml"


def test_the_agreed_fights_load_and_name_two_fighters_a_date_and_a_minimum() -> None:
    cases = load_regression_cases(CASES_FILE)
    assert len(cases) >= 3
    for case in cases:
        assert len(case.fighters) == 2 and case.fighters[0] != case.fighters[1]
        assert 1 <= case.min_stars <= 5 and case.why


def test_a_fight_below_its_minimum_or_missing_fails_and_one_at_or_above_passes() -> None:
    day = dt.date(2026, 1, 24)
    case = RegressionCase(("A One", "B Two"), day, 3.0, "a knockout is never below 3")
    assert check_regressions([case], lambda f, d: 3.0)[0].failed is False
    assert check_regressions([case], lambda f, d: 4.5)[0].failed is False
    below = check_regressions([case], lambda f, d: 2.5)[0]
    assert below.failed and below.line().startswith("FAIL")
    missing = check_regressions([case], lambda f, d: None)[0]
    assert missing.failed and "not found" in missing.line()


def test_the_lookup_gets_the_fighters_and_the_date_of_each_case() -> None:
    seen: list[tuple[tuple[str, str], dt.date]] = []

    def lookup(fighters: tuple[str, str], on: dt.date) -> float | None:
        seen.append((fighters, on))
        return 5.0

    cases = load_regression_cases(CASES_FILE)
    check_regressions(cases, lookup)
    assert seen == [(case.fighters, case.date) for case in cases]


def test_a_malformed_entry_is_an_error_never_skipped(tmp_path) -> None:  # type: ignore[no-untyped-def]
    for bad in (
        '[[fight]]\nfighters = ["Only One"]\ndate = "2026-01-01"\nmin_stars = 3\n',
        '[[fight]]\nfighters = ["A", "B"]\ndate = "2026-01-01"\nmin_stars = 9\n',
        '[[fight]]\nfighters = ["A", "B"]\ndate = "soon"\nmin_stars = 3\n',
    ):
        path = tmp_path / "bad.toml"
        path.write_text(bad, encoding="utf-8")
        with pytest.raises(ValueError):
            load_regression_cases(path)
