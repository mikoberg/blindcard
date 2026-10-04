"""Integration tests for PostgresRepository against a THROWAWAY Supabase/Postgres database.

Skipped unless TEST_DATABASE_URL is set. The database must already have
supabase/migrations/0001_init.sql applied. These tests only touch rows with source 'dbtest'
and scoring version 9001, and clean up after themselves.
"""

from __future__ import annotations

import datetime as dt
import os
from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest
from fakes import make_bundle

from blindcard_ingest.db.repository import PostgresRepository, RepositoryError
from blindcard_ingest.pipeline import run_rescore
from blindcard_ingest.settings import DEFAULT_SCORING_CONFIG_DIR

DB_URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = [
    pytest.mark.db,
    pytest.mark.skipif(not DB_URL, reason="TEST_DATABASE_URL is not set"),
]

SOURCE = "dbtest"
VERSION = 9001
DATE = dt.date(2026, 1, 1)


def _cleanup(conn: psycopg.Connection) -> None:
    # `rescore` scores the whole database pool, so on a populated database the test version
    # also owns scores of real fights: remove those before the version row itself.
    conn.execute("delete from public.excitement_scores where version = %s", (VERSION,))
    conn.execute("delete from public.excitement_features where version = %s", (VERSION,))
    conn.execute("delete from public.events where source = %s", (SOURCE,))
    conn.execute("delete from public.fighters where source = %s", (SOURCE,))
    conn.execute("delete from public.scoring_versions where version = %s", (VERSION,))


@pytest.fixture
def conn() -> Iterator[psycopg.Connection]:
    assert DB_URL
    with psycopg.connect(DB_URL, autocommit=True) as connection:
        _cleanup(connection)
        yield connection
        _cleanup(connection)


@pytest.fixture
def repo(conn: psycopg.Connection) -> Iterator[PostgresRepository]:
    assert DB_URL
    repository = PostgresRepository(DB_URL)
    yield repository
    repository.close()


def count(conn: psycopg.Connection, table: str, where: str, *params: object) -> int:
    row = conn.execute(f"select count(*) from public.{table} where {where}", params).fetchone()
    assert row is not None
    return int(row[0])


def totals(conn: psycopg.Connection) -> dict[str, int]:
    return {
        "events": count(conn, "events", "source = %s", SOURCE),
        "fighters": count(conn, "fighters", "source = %s", SOURCE),
        "fights": count(conn, "fights", "source = %s", SOURCE),
        "results": count(
            conn,
            "fight_results",
            "fight_id in (select id from public.fights where source = %s)",
            SOURCE,
        ),
        "rounds": count(
            conn,
            "fight_rounds",
            "fight_id in (select id from public.fights where source = %s)",
            SOURCE,
        ),
    }


def test_upserting_the_same_event_twice_changes_nothing(
    conn: psycopg.Connection, repo: PostgresRepository
) -> None:
    bundle = make_bundle("db1", DATE, seed=3)
    repo.upsert_event_bundle(SOURCE, "UFC", bundle)
    first = totals(conn)
    repo.upsert_event_bundle(SOURCE, "UFC", bundle)

    assert totals(conn) == first
    assert first["events"] == 1
    assert first["fights"] == 6
    assert first["fighters"] == 12
    assert first["results"] == 6
    assert first["rounds"] > 0


def test_complete_events_are_reported_and_incomplete_ones_are_not(
    repo: PostgresRepository,
) -> None:
    repo.upsert_event_bundle(SOURCE, "UFC", make_bundle("done", DATE, seed=1))
    repo.upsert_event_bundle(SOURCE, "UFC", make_bundle("lagging", DATE, seed=2, complete=False))

    assert repo.complete_event_source_ids(SOURCE) == {"done"}

    repo.upsert_event_bundle(SOURCE, "UFC", make_bundle("lagging", DATE, seed=2, complete=True))
    assert repo.complete_event_source_ids(SOURCE) == {"done", "lagging"}


def test_slugs_are_stable_and_collisions_get_a_suffix(
    conn: psycopg.Connection, repo: PostgresRepository
) -> None:
    first = make_bundle("slug-a", DATE, seed=1)
    other = make_bundle("slug-b", DATE, seed=2)
    other = other.model_copy(
        update={"event": other.event.model_copy(update={"name": first.event.name})}
    )

    repo.upsert_event_bundle(SOURCE, "UFC", first)
    repo.upsert_event_bundle(SOURCE, "UFC", other)
    slugs = {
        r[0]: r[1]
        for r in conn.execute(
            "select source_id, slug from public.events where source = %s", (SOURCE,)
        )
    }
    assert slugs["slug-a"] != slugs["slug-b"]

    repo.upsert_event_bundle(SOURCE, "UFC", first)
    again = conn.execute(
        "select slug from public.events where source = %s and source_id = 'slug-a'", (SOURCE,)
    ).fetchone()
    assert again is not None
    assert again[0] == slugs["slug-a"]


def test_database_rejects_fighters_in_the_wrong_order(
    conn: psycopg.Connection, repo: PostgresRepository
) -> None:
    repo.upsert_event_bundle(SOURCE, "UFC", make_bundle("order", DATE, seed=1))
    row = conn.execute(
        "select id, event_id, fighter_a_id, fighter_b_id from public.fights "
        "where source = %s limit 1",
        (SOURCE,),
    ).fetchone()
    assert row is not None
    fight_id, _event_id, a_id, b_id = row

    with pytest.raises(psycopg.errors.RaiseException, match="smaller source_id"):
        conn.execute(
            "update public.fights set fighter_a_id = %s, fighter_b_id = %s where id = %s",
            (b_id, a_id, fight_id),
        )


def test_rescore_stores_valid_scores_and_is_repeatable(
    conn: psycopg.Connection, repo: PostgresRepository, tmp_path: Path
) -> None:
    text = (DEFAULT_SCORING_CONFIG_DIR / "scoring_v1.toml").read_text(encoding="utf-8")
    text = text.replace("version = 1", f"version = {VERSION}", 1)
    text = text.replace("min_pool_size = 100", "min_pool_size = 5")
    (tmp_path / f"scoring_v{VERSION}.toml").write_text(text, encoding="utf-8")
    for i in range(3):
        repo.upsert_event_bundle(SOURCE, "UFC", make_bundle(f"sc{i}", DATE, seed=i * 10))

    run_rescore(repo, tmp_path, VERSION)
    first = conn.execute(
        "select fight_id, stars, percentile from public.excitement_scores "
        "where version = %s order by fight_id",
        (VERSION,),
    ).fetchall()
    run_rescore(repo, tmp_path, VERSION)
    second = conn.execute(
        "select fight_id, stars, percentile from public.excitement_scores "
        "where version = %s order by fight_id",
        (VERSION,),
    ).fetchall()

    assert first == second
    assert len(first) >= 18
    assert count(conn, "excitement_features", "version = %s", VERSION) == len(first)


def test_bonuses_survive_a_re_ingest_of_the_event(
    conn: psycopg.Connection, repo: PostgresRepository
) -> None:
    """Bonuses are labels owned by the bonus ingester: re-ingesting results must not wipe them."""
    bundle = make_bundle("bonus1", DATE, seed=3)
    repo.upsert_event_bundle(SOURCE, "UFC", bundle)
    fight_source_id = bundle.fights[0].source_id

    assert repo.set_bonuses(SOURCE, {fight_source_id: ["performance_of_the_night"]}) == 1
    repo.upsert_event_bundle(SOURCE, "UFC", bundle)  # rewrites the result row, bonuses = []

    row = conn.execute(
        "select r.bonuses from public.fight_results r join public.fights f on f.id = r.fight_id "
        "where f.source = %s and f.source_id = %s",
        (SOURCE, fight_source_id),
    ).fetchone()
    assert row is not None
    assert row[0] == ["performance_of_the_night"]


def test_set_bonuses_is_idempotent_and_ignores_unknown_fights(
    conn: psycopg.Connection, repo: PostgresRepository
) -> None:
    bundle = make_bundle("bonus2", DATE, seed=4)
    repo.upsert_event_bundle(SOURCE, "UFC", bundle)
    known = bundle.fights[1].source_id
    awards = {known: ["fight_of_the_night"], "no-such-fight": ["performance_of_the_night"]}

    assert repo.set_bonuses(SOURCE, awards) == 1  # only the existing fight is updated
    assert repo.set_bonuses(SOURCE, awards) == 1  # same again: same state
    row = conn.execute(
        "select r.bonuses from public.fight_results r join public.fights f on f.id = r.fight_id "
        "where f.source = %s and f.source_id = %s",
        (SOURCE, known),
    ).fetchone()
    assert row is not None
    assert row[0] == ["fight_of_the_night"]
    assert repo.set_bonuses(SOURCE, {}) == 0


def test_labeled_fights_come_only_from_events_with_a_stored_bonus(
    conn: psycopg.Connection, repo: PostgresRepository
) -> None:
    labeled = make_bundle("lab1", DATE, seed=5)
    unlabeled = make_bundle("lab2", DATE, seed=6)
    repo.upsert_event_bundle(SOURCE, "UFC", labeled)
    repo.upsert_event_bundle(SOURCE, "UFC", unlabeled)
    repo.set_bonuses(SOURCE, {labeled.fights[0].source_id: ["fight_of_the_night"]})

    fights = repo.labeled_fights(SOURCE)

    assert {f.event_source_id for f in fights} == {labeled.event.source_id}
    assert len(fights) == len(labeled.fights)
    assert all(f.fights_on_card == len(labeled.fights) for f in fights)
    flagged = {f.fight_id: f.bonuses for f in fights if f.bonuses}
    assert list(flagged.values()) == [("fight_of_the_night",)]
    assert sorted(f.card_position for f in fights) == sorted(
        f.card_position for f in labeled.fights
    )


def test_card_segments_are_stored_survive_a_re_ingest_and_ignore_unknown_fights(
    conn: psycopg.Connection, repo: PostgresRepository
) -> None:
    bundle = make_bundle("seg1", DATE, seed=7)
    repo.upsert_event_bundle(SOURCE, "UFC", bundle)
    first, second = bundle.fights[0].source_id, bundle.fights[1].source_id
    awards = {first: "main", second: "early_prelim", "no-such-fight": "prelim"}

    assert repo.set_card_segments(SOURCE, awards) == 2
    repo.upsert_event_bundle(SOURCE, "UFC", bundle)  # re-ingesting the event keeps its segments

    rows = conn.execute(
        "select source_id, card_segment from public.fights"
        " where source = %s and source_id in (%s, %s)",
        (SOURCE, first, second),
    ).fetchall()
    assert dict(rows) == {first: "main", second: "early_prelim"}
    with pytest.raises(RepositoryError):
        repo.set_card_segments(SOURCE, {first: "headliner"})
