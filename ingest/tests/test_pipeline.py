import datetime as dt
from pathlib import Path

import pytest
from fakes import FakeRepository, FakeSource, make_bundle

from blindcard_ingest.pipeline import (
    INCOMPLETE_GRACE_DAYS,
    run_backfill,
    run_ingest_latest,
    run_rescore,
)
from blindcard_ingest.settings import DEFAULT_SCORING_CONFIG_DIR

TODAY = dt.date(2026, 10, 4)


def days_ago(n: int) -> dt.date:
    return TODAY - dt.timedelta(days=n)


@pytest.fixture
def config_dir(tmp_path: Path) -> Path:
    """The shipped v1 config with a small calibration-pool minimum, so tests stay tiny."""
    text = (DEFAULT_SCORING_CONFIG_DIR / "scoring_v1.toml").read_text(encoding="utf-8")
    assert "min_pool_size = 100" in text
    (tmp_path / "scoring_v1.toml").write_text(
        text.replace("min_pool_size = 100", "min_pool_size = 5"), encoding="utf-8"
    )
    return tmp_path


@pytest.fixture
def seeded_repo(config_dir: Path) -> FakeRepository:
    """History for the calibration pool, with an active score version 1."""
    repo = FakeRepository()
    for i in range(3):
        repo.upsert_event_bundle(
            "fakesource", "UFC", make_bundle(f"old{i}", days_ago(200 + i), seed=i * 10)
        )
    run_rescore(repo, config_dir, 1)
    repo.upserts = 0
    return repo


# --- ingest-latest -------------------------------------------------------------------------


def test_ingest_latest_stores_and_scores_a_complete_event(seeded_repo: FakeRepository) -> None:
    source = FakeSource([make_bundle("new1", days_ago(1), seed=100)])
    report = run_ingest_latest(source, seeded_repo, today=TODAY)

    assert not report.has_errors, report.errors
    assert (report.events_stored, report.events_complete, report.fights_scored) == (1, 1, 6)
    assert source.fetch_calls == [("new1", True)]  # recent events are always refreshed
    stars = [seeded_repo.scores[(f"new1-f{i}", 1)].stars for i in range(6)]
    assert all(1.0 <= s <= 5.0 and s * 2 == round(s * 2) for s in stars)


def test_rerunning_ingest_latest_changes_nothing(seeded_repo: FakeRepository) -> None:
    source = FakeSource([make_bundle("new1", days_ago(1), seed=100)])
    run_ingest_latest(source, seeded_repo, today=TODAY)
    scores_before = dict(seeded_repo.scores)
    upserts_before = seeded_repo.upserts

    report = run_ingest_latest(source, seeded_repo, today=TODAY)

    assert source.fetch_calls == [("new1", True)]  # not fetched again
    assert seeded_repo.upserts == upserts_before
    assert seeded_repo.scores == scores_before
    assert report.events_considered == 0


def test_event_still_being_filled_in_is_retried_not_failed(seeded_repo: FakeRepository) -> None:
    source = FakeSource([make_bundle("new1", days_ago(0), seed=100, complete=False)])
    first = run_ingest_latest(source, seeded_repo, today=TODAY)

    assert not first.has_errors
    assert (first.events_stored, first.events_pending, first.events_complete) == (1, 1, 0)
    assert first.fights_scored == 0
    assert not any(key[0].startswith("new1") for key in seeded_repo.scores)

    source.bundles["new1"] = make_bundle("new1", days_ago(0), seed=100, complete=True)
    second = run_ingest_latest(source, seeded_repo, today=TODAY)

    assert not second.has_errors
    assert second.fights_scored == 6
    assert [call[0] for call in source.fetch_calls] == ["new1", "new1"]


def test_event_incomplete_beyond_grace_is_an_error_for_ingest_latest(
    seeded_repo: FakeRepository,
) -> None:
    age = INCOMPLETE_GRACE_DAYS + 1
    source = FakeSource([make_bundle("stale", days_ago(age), seed=5, complete=False)])
    report = run_ingest_latest(source, seeded_repo, today=TODAY)

    assert report.events_incomplete_overdue == 1
    assert report.has_errors
    assert "still incomplete" in report.errors[0]


def test_one_failing_event_does_not_stop_the_others(seeded_repo: FakeRepository) -> None:
    source = FakeSource(
        [make_bundle("bad", days_ago(2), seed=1), make_bundle("good", days_ago(1), seed=2)]
    )
    source.failing.add("bad")
    report = run_ingest_latest(source, seeded_repo, today=TODAY)

    assert report.events_failed == 1
    assert report.has_errors
    assert report.events_complete == 1
    assert ("good-f0", 1) in seeded_repo.scores


def test_unknown_method_stays_unscored_and_fails_the_run(seeded_repo: FakeRepository) -> None:
    bundle = make_bundle("new1", days_ago(1), seed=100, methods={2: "Mystery Method"})
    report = run_ingest_latest(FakeSource([bundle]), seeded_repo, today=TODAY)

    assert report.fights_unscored == 1
    assert report.fights_scored == 5
    assert report.has_errors
    assert ("new1-f2", 1) not in seeded_repo.scores
    assert ("new1-f0", 1) in seeded_repo.scores
    assert "Mystery" not in " ".join(report.errors)  # the method must not reach the logs


def test_no_contests_are_scored_like_any_other_fight_and_do_not_fail_the_run(
    seeded_repo: FakeRepository,
) -> None:
    """Otherwise a missing score on the public card would reveal the no contest."""
    methods = {1: "Could Not Continue", 3: "Overturned"}
    bundle = make_bundle("new1", days_ago(1), seed=100, methods=methods)
    report = run_ingest_latest(FakeSource([bundle]), seeded_repo, today=TODAY)

    assert not report.has_errors, report.errors
    assert report.fights_scored == 6
    assert report.fights_unscored == 0
    for fight_number in range(6):
        assert (f"new1-f{fight_number}", 1) in seeded_repo.scores


def test_without_an_active_score_version_nothing_is_scored(config_dir: Path) -> None:
    repo = FakeRepository()
    source = FakeSource([make_bundle("new1", days_ago(1))])
    report = run_ingest_latest(source, repo, today=TODAY)

    assert report.events_stored == 1  # data is still stored
    assert report.has_errors
    assert "no active scoring version" in report.errors[0]
    assert repo.scores == {}


def test_since_days_window_excludes_old_events(seeded_repo: FakeRepository) -> None:
    source = FakeSource(
        [make_bundle("ancient", days_ago(100)), make_bundle("recent", days_ago(3), seed=7)]
    )
    run_ingest_latest(source, seeded_repo, today=TODAY, since_days=21)
    assert [call[0] for call in source.fetch_calls] == ["recent"]


def test_dry_run_fetches_but_writes_nothing(seeded_repo: FakeRepository) -> None:
    source = FakeSource([make_bundle("new1", days_ago(1), seed=100)])
    report = run_ingest_latest(source, seeded_repo, today=TODAY, dry_run=True)

    assert source.fetch_calls == [("new1", True)]
    assert seeded_repo.upserts == 0
    assert report.events_stored == 0
    assert not any(key[0].startswith("new1") for key in seeded_repo.scores)


# --- backfill ------------------------------------------------------------------------------


def test_backfill_respects_from_year_and_skips_complete_events() -> None:
    repo = FakeRepository()
    source = FakeSource(
        [
            make_bundle("e2019", dt.date(2019, 5, 1), seed=1),
            make_bundle("e2022", dt.date(2022, 5, 1), seed=2),
            make_bundle("e2024", dt.date(2024, 5, 1), seed=3),
        ]
    )
    first = run_backfill(source, repo, from_year=2022, today=TODAY)
    assert first.events_stored == 2
    assert {call[0] for call in source.fetch_calls} == {"e2022", "e2024"}
    assert all(refresh is False for _, refresh in source.fetch_calls)

    run_backfill(source, repo, from_year=2022, today=TODAY)
    assert len(source.fetch_calls) == 2  # nothing refetched


def test_backfill_tolerates_old_events_without_round_data() -> None:
    repo = FakeRepository()
    source = FakeSource([make_bundle("old", dt.date(2010, 1, 1), complete=False)])
    report = run_backfill(source, repo, from_year=2000, today=TODAY)

    assert report.events_incomplete_overdue == 1
    assert not report.has_errors  # old data gaps are expected; only real failures are errors


# --- rescore -------------------------------------------------------------------------------


def test_rescore_builds_reference_scores_everything_and_activates_first_version(
    config_dir: Path,
) -> None:
    repo = FakeRepository()
    for i in range(3):
        repo.upsert_event_bundle(
            "fakesource", "UFC", make_bundle(f"h{i}", days_ago(300 + i), seed=i * 9)
        )
    report = run_rescore(repo, config_dir, 1)

    assert report.pool_size == 18
    assert sum(report.stars_histogram.values()) == 18
    assert repo.active_version == 1  # first version activates itself
    assert len(repo.scores) == 18


def test_rescore_is_deterministic(config_dir: Path, seeded_repo: FakeRepository) -> None:
    before = dict(seeded_repo.scores)
    run_rescore(seeded_repo, config_dir, 1)
    assert seeded_repo.scores == before


def test_rescore_counts_unscorable_fights_without_failing(config_dir: Path) -> None:
    repo = FakeRepository()
    repo.upsert_event_bundle(
        "fakesource",
        "UFC",
        make_bundle("h", days_ago(300), fights=8, methods={0: "Mystery Method"}),
    )
    report = run_rescore(repo, config_dir, 1)
    assert (report.pool_size, report.unscorable) == (7, 1)


def test_rescore_dry_run_stores_nothing(config_dir: Path) -> None:
    repo = FakeRepository()
    repo.upsert_event_bundle("fakesource", "UFC", make_bundle("h", days_ago(300), fights=8))
    report = run_rescore(repo, config_dir, 1, dry_run=True)
    assert report.pool_size == 8
    assert repo.versions == {} and repo.scores == {} and repo.active_version is None


def test_new_version_is_not_activated_unless_asked(
    config_dir: Path, seeded_repo: FakeRepository
) -> None:
    text = (config_dir / "scoring_v1.toml").read_text(encoding="utf-8")
    (config_dir / "scoring_v2.toml").write_text(
        text.replace("version = 1", "version = 2", 1), encoding="utf-8"
    )

    run_rescore(seeded_repo, config_dir, 2)
    assert seeded_repo.active_version == 1
    run_rescore(seeded_repo, config_dir, 2, activate=True)
    assert seeded_repo.active_version == 2
