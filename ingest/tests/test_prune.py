"""prune-scores: old versions go, the active one and the newest stay."""

from __future__ import annotations

import pytest
from fakes import FakeRepository

from blindcard_ingest.prune import run_prune_scores


def repo(versions: list[int], active: int) -> FakeRepository:
    r = FakeRepository()
    r.score_versions = versions
    r.active_version = active
    return r


def test_it_keeps_the_active_version_and_the_newest_others() -> None:
    r = repo(list(range(1, 23)), active=22)
    report = run_prune_scores(r, keep=2)
    assert report.versions == list(range(1, 21))  # 21 and 22 stay
    assert r.pruned == list(range(1, 21))


def test_an_older_active_version_is_kept_even_when_newer_ones_exist() -> None:
    r = repo([1, 2, 3, 4, 5], active=2)
    assert run_prune_scores(r, keep=2).versions == [1, 3, 4]  # the active 2 and the newest 5 stay


def test_a_dry_run_deletes_nothing_and_reclaims_nothing() -> None:
    r = repo([1, 2, 3], active=3)
    report = run_prune_scores(r, keep=1, reclaim=True, dry_run=True)
    assert report.versions == [1, 2] and not hasattr(r, "pruned") and not hasattr(r, "reclaimed")


def test_reclaiming_is_a_separate_step_after_the_delete() -> None:
    r = repo([1, 2, 3], active=3)
    run_prune_scores(r, keep=1, reclaim=True)
    assert r.pruned == [1, 2] and r.reclaimed is True


def test_nothing_to_drop_does_nothing() -> None:
    r = repo([1, 2], active=2)
    assert run_prune_scores(r, keep=2).versions == [] and not hasattr(r, "pruned")


def test_the_active_version_can_never_be_pruned() -> None:
    r = repo([1, 2], active=2)
    with pytest.raises(RuntimeError):
        r.prune_score_versions([2])


def test_logs_carry_numbers_only(caplog) -> None:  # type: ignore[no-untyped-def]
    r = repo([1, 2, 3], active=3)
    with caplog.at_level("INFO"):
        run_prune_scores(r, keep=1)
    assert "versions 1,2" in caplog.text and "20 score rows" in caplog.text
