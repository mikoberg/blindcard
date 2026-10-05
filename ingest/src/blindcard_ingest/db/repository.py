"""Repository: the only place that talks SQL.

`Repository` is the contract the pipeline depends on. `PostgresRepository` implements it with
psycopg 3. Writes are idempotent upserts keyed on natural keys, one transaction per event.
"""

from __future__ import annotations

import logging
from collections.abc import Collection, Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date
from typing import Any, Protocol

import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from blindcard_ingest.bonus_matching import EventToLabel, FightNames
from blindcard_ingest.judges import JudgeReport
from blindcard_ingest.models import EventBundle, ParsedFight, ParsedRound, slugify
from blindcard_ingest.predict.dataset import FightRow
from blindcard_ingest.predict.types import UpcomingBoutInput, UpcomingPrediction
from blindcard_ingest.scoring.career import HistoryBout, career_contexts, career_json
from blindcard_ingest.scoring.config import ScoringConfig
from blindcard_ingest.scoring.features import (
    MethodKind,
    ScoringInput,
    classify_method,
    is_injury_stoppage,
)
from blindcard_ingest.scoring.scorer import Reference, ScoredFight
from blindcard_ingest.upcoming import UpcomingEvent

logger = logging.getLogger(__name__)


class RepositoryError(RuntimeError):
    """A database write failed. The message deliberately holds no row data."""


def describe_db_error(exc: psycopg.Error) -> str:
    """SQLSTATE and constraint name only.

    Postgres puts the offending row in the error text (`DETAIL: Failing row contains (...)`),
    which here can be a fight result. Logs may be public (CI), so none of that is kept.
    """
    parts = [f"database error {exc.sqlstate or 'unknown'}"]
    constraint = exc.diag.constraint_name
    if constraint:
        parts.append(f"constraint {constraint}")
    return " ".join(parts)


@contextmanager
def sanitized_db_errors() -> Iterator[None]:
    try:
        yield
    except psycopg.Error as exc:
        raise RepositoryError(describe_db_error(exc)) from None


@dataclass(frozen=True)
class FightScoringInput:
    fight_id: str
    event_source_id: str
    input: ScoringInput


@dataclass(frozen=True)
class LabeledFight:
    """A scorable fight of an event that has bonus labels, for fitting and analysing scores.

    Result-side data (bonuses, method, rounds): never shipped anywhere public.
    """

    fight_id: str
    event_source_id: str
    event_date: date
    card_position: int
    fights_on_card: int
    is_title_fight: bool
    bonuses: tuple[str, ...]
    input: ScoringInput


@dataclass(frozen=True)
class FightSides:
    """A stored fight with both fighters, for looking their pages up (all pre-fight facts)."""

    fight_source_id: str
    event_date: date
    a_source_id: str
    a_name: str
    b_source_id: str
    b_name: str
    #: `fights.records` as stored now (None = nothing yet).
    stored_records: dict[str, Any] | None = None


@dataclass(frozen=True)
class RatedFight:
    """A rated fight with its two fighters and event (pre-fight facts and the public rating)."""

    fight_id: str
    fighter_a: str
    fighter_b: str
    event_name: str
    stars: float


@dataclass(frozen=True)
class StoredScoringVersion:
    config: ScoringConfig
    reference: Reference


class Repository(Protocol):
    def complete_event_source_ids(self, source: str) -> set[str]:
        """Events whose every fight has a stored result AND round data."""
        ...

    def upsert_event_bundle(self, source: str, promotion: str, bundle: EventBundle) -> None:
        """Idempotently store one event with its fights, in a single transaction."""
        ...

    def get_active_scoring_version(self) -> StoredScoringVersion | None: ...

    def scoring_inputs(
        self,
        *,
        source: str | None = None,
        event_source_ids: Collection[str] | None = None,
        missing_score_for_version: int | None = None,
    ) -> list[FightScoringInput]:
        """Fights with a result and round data, optionally only those lacking a score."""
        ...

    def save_scores(self, version: int, scored: Sequence[tuple[str, ScoredFight]]) -> None:
        """Upsert scores (public) and features (private) for the given fights."""
        ...

    def labeled_fights(self, source: str) -> list[LabeledFight]:
        """Scorable fights of events with at least one stored bonus, in event/card order."""
        ...

    def set_bonuses(self, source: str, bonuses_by_fight: Mapping[str, Sequence[str]]) -> int:
        """Set `fight_results.bonuses` (private, result-side) for fights by their source id.

        Returns how many existing fights were updated; unknown fights are ignored.
        """
        ...

    def fights_with_sides(self, source: str, from_year: int) -> list[FightSides]:
        """Stored fights from `from_year` on, with both fighters' ids and names."""
        ...

    def set_fighter_countries(self, source: str, countries: Mapping[str, str]) -> int:
        """Set `fighters.country` by fighter source id; returns how many rows changed."""
        ...

    def set_fight_records(self, source: str, records: Mapping[str, Mapping[str, Any]]) -> int:
        """Set `fights.records` by fight source id; returns how many rows changed."""
        ...

    def refresh_career_context(self, source: str) -> int:
        """Compute `fights.career` (rematch, streaks, unbeaten) for every fight of `source`.

        Built from the fighters' history before each bout. Returns how many rows changed.
        """
        ...

    def decision_scorecards(self) -> list[tuple[str, int, list[str]]]:
        """(fight id, event year, scorecard texts) of every decision with a winner and 3 cards."""
        ...

    def replace_judge_stats(self, report: JudgeReport) -> int:
        """Replace the stored judge statistics (public aggregates). Returns the judges stored."""
        ...

    def rated_fights(self, min_stars: float) -> list[RatedFight]:
        """Fights rated `min_stars` or more by the active score version."""
        ...

    def fighter_names(self) -> list[tuple[str, str]]:
        """(fighter id, name) of every stored fighter."""
        ...

    def prediction_fights(self) -> list[FightRow]:
        """Every fight rated by the active score version, with its public facts."""
        ...

    def upcoming_bouts_for_prediction(self) -> list[UpcomingBoutInput]:
        """Every announced bout that has not been fought, with the size of its card."""
        ...

    def set_upcoming_predictions(self, predictions: Sequence[UpcomingPrediction]) -> None:
        """Store the expected ratings; a bout without one in `predictions` loses any old one."""
        ...

    def replace_upcoming(
        self, events: Sequence[UpcomingEvent], fighter_ids: Mapping[str, str], *, today: date
    ) -> None:
        """Rebuild the upcoming tables: upsert `events` with their bouts, drop events that are no
        longer announced and events dated before `today`. `fighter_ids` maps a name to the id of
        the one stored fighter with that name (names not in it stay unlinked)."""
        ...

    def set_fight_videos(self, videos_by_fight: Mapping[str, str], *, channel: str) -> int:
        """Store the official video id of fights (fight id -> YouTube video id). Returns changes."""
        ...

    def set_card_segments(self, source: str, segments_by_fight: Mapping[str, str]) -> int:
        """Set `fights.card_segment` (main / prelim / early_prelim) by fight source id.

        Returns how many existing fights were updated; unknown fights are ignored.
        """
        ...

    def events_for_bonus_matching(self, source: str, from_year: int) -> list[EventToLabel]:
        """Stored events from `from_year` on, with the fighter names of each fight."""
        ...

    def replace_version(
        self,
        config: ScoringConfig,
        reference: Reference,
        scored: Sequence[tuple[str, ScoredFight]],
        *,
        activate: bool,
    ) -> None:
        """Atomically (re)create a score version: snapshot, all its scores, optional activation."""
        ...

    def close(self) -> None: ...


class PostgresRepository:
    def __init__(self, conninfo: str) -> None:
        # prepare_threshold=None: safe behind Supabase's transaction pooler.
        self._conn: psycopg.Connection[dict[str, Any]] = psycopg.connect(
            conninfo, row_factory=dict_row, prepare_threshold=None
        )

    def close(self) -> None:
        self._conn.close()

    # --- ingest ---------------------------------------------------------------------------

    def complete_event_source_ids(self, source: str) -> set[str]:
        query = """
            select e.source_id
            from public.events e
            where e.source = %s
              and exists (select 1 from public.fights f where f.event_id = e.id)
              and not exists (
                select 1 from public.fights f
                where f.event_id = e.id
                  and (not exists (select 1 from public.fight_results r where r.fight_id = f.id)
                       or not exists (
                         select 1 from public.fight_rounds fr where fr.fight_id = f.id))
              )
        """
        with self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(query, (source,))
            return {row["source_id"] for row in cur.fetchall()}

    def upsert_event_bundle(self, source: str, promotion: str, bundle: EventBundle) -> None:
        event = bundle.event
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            event_slug = self._slug_for(cur, "events", slugify(event.name), source, event.source_id)
            cur.execute(
                """
                insert into public.events
                  (promotion, source, source_id, name, slug, event_date, location)
                values (%s, %s, %s, %s, %s, %s, %s)
                on conflict (source, source_id) do update
                  set name = excluded.name, event_date = excluded.event_date,
                      location = excluded.location, promotion = excluded.promotion
                returning id
                """,
                (
                    promotion,
                    source,
                    event.source_id,
                    event.name,
                    event_slug,
                    event.event_date,
                    event.location,
                ),
            )
            event_id = cur.fetchone()["id"]  # type: ignore[index]

            for fight in bundle.fights:
                self._upsert_fight(cur, source, event_id, fight)
        logger.info("stored event %s (%d fights)", event.source_id, len(bundle.fights))

    def _upsert_fight(
        self, cur: psycopg.Cursor[dict[str, Any]], source: str, event_id: Any, fight: ParsedFight
    ) -> None:
        fighter_ids: dict[str, Any] = {}
        for fighter in (fight.fighter_a, fight.fighter_b):
            slug = self._slug_for(cur, "fighters", slugify(fighter.name), source, fighter.source_id)
            cur.execute(
                """
                insert into public.fighters (source, source_id, name, slug)
                values (%s, %s, %s, %s)
                on conflict (source, source_id) do update set name = excluded.name
                returning id
                """,
                (source, fighter.source_id, fighter.name, slug),
            )
            fighter_ids[fighter.source_id] = cur.fetchone()["id"]  # type: ignore[index]

        cur.execute(
            """
            insert into public.fights
              (event_id, source, source_id, card_position, fighter_a_id, fighter_b_id,
               weight_class, is_title_fight, scheduled_rounds)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            on conflict (source, source_id) do update
              set card_position = excluded.card_position,
                  fighter_a_id = excluded.fighter_a_id,
                  fighter_b_id = excluded.fighter_b_id,
                  weight_class = excluded.weight_class,
                  is_title_fight = excluded.is_title_fight,
                  scheduled_rounds = excluded.scheduled_rounds
            returning id
            """,
            (
                event_id,
                source,
                fight.source_id,
                fight.card_position,
                fighter_ids[fight.fighter_a.source_id],
                fighter_ids[fight.fighter_b.source_id],
                fight.weight_class,
                fight.is_title_fight,
                fight.scheduled_rounds,
            ),
        )
        fight_id = cur.fetchone()["id"]  # type: ignore[index]

        result = fight.result
        if result is not None:
            winner_id = fighter_ids[result.winner_source_id] if result.winner_source_id else None
            cur.execute(
                """
                insert into public.fight_results
                  (fight_id, outcome, winner_fighter_id, method, method_detail, end_round,
                   end_time_seconds, scorecards, bonuses)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (fight_id) do update
                  set outcome = excluded.outcome, winner_fighter_id = excluded.winner_fighter_id,
                      method = excluded.method, method_detail = excluded.method_detail,
                      end_round = excluded.end_round, end_time_seconds = excluded.end_time_seconds,
                      scorecards = excluded.scorecards
                  -- `bonuses` is deliberately NOT updated here: it is owned by the bonus
                  -- ingester (set_bonuses), and the results source never carries bonuses, so
                  -- re-ingesting an event must not wipe them.
                """,
                (
                    fight_id,
                    result.outcome,
                    winner_id,
                    result.method,
                    result.method_detail,
                    result.end_round,
                    result.end_time_seconds,
                    Jsonb(result.scorecards),
                    result.bonuses,
                ),
            )

        # Round data is only stored when it is consistent; otherwise the fight stays
        # "incomplete" and the next run retries it. Delete + insert keeps re-runs exact.
        if not fight.completeness_problems():
            cur.execute("delete from public.fight_rounds where fight_id = %s", (fight_id,))
            cur.executemany(
                """
                insert into public.fight_rounds
                  (fight_id, round_number, fighter_id, knockdowns, sig_strikes_landed,
                   sig_strikes_attempted, total_strikes_landed, total_strikes_attempted,
                   takedowns_landed, takedowns_attempted, sub_attempts, reversals, control_seconds)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                [
                    (
                        fight_id,
                        r.round_number,
                        fighter_ids[r.fighter_source_id],
                        r.knockdowns,
                        r.sig_strikes_landed,
                        r.sig_strikes_attempted,
                        r.total_strikes_landed,
                        r.total_strikes_attempted,
                        r.takedowns_landed,
                        r.takedowns_attempted,
                        r.sub_attempts,
                        r.reversals,
                        r.control_seconds,
                    )
                    for r in fight.rounds
                ],
            )

    @staticmethod
    def _slug_for(
        cur: psycopg.Cursor[dict[str, Any]], table: str, base: str, source: str, source_id: str
    ) -> str:
        """Slugs are set once, on first insert, and never rewritten. Collisions get a suffix."""
        identifier = sql.Identifier("public", table)
        cur.execute(
            sql.SQL("select slug from {} where source = %s and source_id = %s").format(identifier),
            (source, source_id),
        )
        existing = cur.fetchone()
        if existing is not None:
            return str(existing["slug"])
        cur.execute(sql.SQL("select 1 from {} where slug = %s").format(identifier), (base,))
        if cur.fetchone() is None:
            return base
        suffixed = f"{base}-{source_id[:8].lower()}"
        cur.execute(sql.SQL("select 1 from {} where slug = %s").format(identifier), (suffixed,))
        if cur.fetchone() is not None:
            raise RuntimeError(f"cannot find a unique slug for {table} {source_id!r}")
        return suffixed

    # --- scoring --------------------------------------------------------------------------

    def get_active_scoring_version(self) -> StoredScoringVersion | None:
        with self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(
                "select config, reference from public.scoring_versions where is_active limit 1"
            )
            row = cur.fetchone()
        if row is None:
            return None
        return StoredScoringVersion(
            config=ScoringConfig.from_json(row["config"]),
            reference=Reference.from_json(row["reference"]),
        )

    def scoring_inputs(
        self,
        *,
        source: str | None = None,
        event_source_ids: Collection[str] | None = None,
        missing_score_for_version: int | None = None,
    ) -> list[FightScoringInput]:
        query = """
            select f.id, e.source_id as event_source_id, e.event_date, f.scheduled_rounds,
                   f.card_position, f.is_title_fight,
                   r.method, r.method_detail, r.end_round, r.end_time_seconds
            from public.fights f
            join public.events e on e.id = f.event_id
            join public.fight_results r on r.fight_id = f.id
            where exists (select 1 from public.fight_rounds fr where fr.fight_id = f.id)
              and (%(version)s::int is null or not exists (
                    select 1 from public.excitement_scores s
                    where s.fight_id = f.id and s.version = %(version)s::int))
              and (%(source)s::text is null or e.source = %(source)s::text)
              and (%(event_ids)s::text[] is null or e.source_id = any(%(event_ids)s::text[]))
            order by e.event_date, f.card_position
        """
        params = {
            "version": missing_score_for_version,
            "source": source,
            "event_ids": None if event_source_ids is None else list(event_source_ids),
        }
        with self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(query, params)
            fights = cur.fetchall()
            rounds_by_fight: dict[Any, list[ParsedRound]] = {}
            if fights:
                cur.execute(
                    """
                    select fr.fight_id, fr.round_number, p.source_id as fighter_source_id,
                           fr.knockdowns, fr.sig_strikes_landed, fr.sig_strikes_attempted,
                           fr.total_strikes_landed, fr.total_strikes_attempted,
                           fr.takedowns_landed, fr.takedowns_attempted, fr.sub_attempts,
                           fr.reversals, fr.control_seconds
                    from public.fight_rounds fr
                    join public.fighters p on p.id = fr.fighter_id
                    where fr.fight_id = any(%s::uuid[])
                    order by fr.fight_id, fr.round_number
                    """,
                    ([row["id"] for row in fights],),
                )
                for row in cur.fetchall():
                    fight_key = row.pop("fight_id")
                    rounds_by_fight.setdefault(fight_key, []).append(ParsedRound(**row))

        contexts = career_contexts(self._history_bouts())
        return [
            FightScoringInput(
                fight_id=str(row["id"]),
                event_source_id=row["event_source_id"],
                input=ScoringInput(
                    scheduled_rounds=row["scheduled_rounds"],
                    method=row["method"],
                    end_round=row["end_round"],
                    end_time_seconds=row["end_time_seconds"],
                    rounds=rounds_by_fight.get(row["id"], []),
                    card_position=row["card_position"],
                    is_title_fight=row["is_title_fight"],
                    context=contexts.get(str(row["id"])),
                    method_detail=row["method_detail"],
                    event_year=row["event_date"].year,
                ),
            )
            for row in fights
        ]

    def _history_bouts(self) -> list[HistoryBout]:
        """Every stored bout with who won, for the fighters' history (all sources)."""
        query = """
            select f.id, e.event_date, f.card_position, f.is_title_fight,
                   a.source_id as a_id, b.source_id as b_id, w.source_id as winner,
                   r.outcome, r.method, r.method_detail, (r.fight_id is not null) as has_result
            from public.fights f
            join public.events e on e.id = f.event_id
            join public.fighters a on a.id = f.fighter_a_id
            join public.fighters b on b.id = f.fighter_b_id
            left join public.fight_results r on r.fight_id = f.id
            left join public.fighters w on w.id = r.winner_fighter_id
        """
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(query)
            rows = cur.fetchall()
        return [
            HistoryBout(
                fight_id=str(row["id"]),
                event_date=row["event_date"],
                card_position=row["card_position"],
                is_title_fight=row["is_title_fight"],
                fighter_a=row["a_id"],
                fighter_b=row["b_id"],
                winner=row["winner"],
                has_result=row["has_result"],
                outcome=row["outcome"] or "win",
                ended_by=_ended_by(row["method"], row["method_detail"]),
            )
            for row in rows
        ]

    def save_scores(self, version: int, scored: Sequence[tuple[str, ScoredFight]]) -> None:
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            self._write_scores(cur, version, scored)

    def set_bonuses(self, source: str, bonuses_by_fight: Mapping[str, Sequence[str]]) -> int:
        if not bonuses_by_fight:
            return 0
        updated = 0
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            for fight_source_id, bonuses in bonuses_by_fight.items():
                cur.execute(
                    """
                    update public.fight_results r
                    set bonuses = %s
                    from public.fights f
                    where f.id = r.fight_id and f.source = %s and f.source_id = %s
                    """,
                    (list(bonuses), source, fight_source_id),
                )
                updated += cur.rowcount
        return updated

    def fights_with_sides(self, source: str, from_year: int) -> list[FightSides]:
        query = """
            select f.source_id as fight_source_id, e.event_date, f.records,
                   a.source_id as a_id, a.name as a_name, b.source_id as b_id, b.name as b_name
            from public.fights f
            join public.events e on e.id = f.event_id
            join public.fighters a on a.id = f.fighter_a_id
            join public.fighters b on b.id = f.fighter_b_id
            where f.source = %s and e.event_date >= make_date(%s, 1, 1)
            order by e.event_date, f.card_position
        """
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(query, (source, from_year))
            rows = cur.fetchall()
        return [
            FightSides(
                fight_source_id=row["fight_source_id"],
                event_date=row["event_date"],
                a_source_id=row["a_id"],
                a_name=row["a_name"],
                b_source_id=row["b_id"],
                b_name=row["b_name"],
                stored_records=row["records"],
            )
            for row in rows
        ]

    def set_fighter_countries(self, source: str, countries: Mapping[str, str]) -> int:
        changed = 0
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            for fighter_source_id, code in countries.items():
                cur.execute(
                    "update public.fighters set country = %s"
                    " where source = %s and source_id = %s and country is distinct from %s",
                    (code, source, fighter_source_id, code),
                )
                changed += cur.rowcount
        return changed

    def set_fight_records(self, source: str, records: Mapping[str, Mapping[str, Any]]) -> int:
        changed = 0
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            for fight_source_id, payload in records.items():
                # Merge by side: a payload with one fighter's record must not erase the other's.
                cur.execute(
                    "update public.fights set records = coalesce(records, '{}'::jsonb) || %s::jsonb"
                    " where source = %s and source_id = %s"
                    " and records is distinct from coalesce(records, '{}'::jsonb) || %s::jsonb",
                    (Jsonb(dict(payload)), source, fight_source_id, Jsonb(dict(payload))),
                )
                changed += cur.rowcount
        return changed

    def refresh_career_context(self, source: str) -> int:
        contexts = career_contexts(self._history_bouts())
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute("select id::text as id from public.fights where source = %s", (source,))
            ids = [row["id"] for row in cur.fetchall()]
            changed = 0
            for fight_id in ids:
                context = contexts.get(fight_id)
                if context is None:
                    continue
                cur.execute(
                    "update public.fights set career = %s"
                    " where id = %s::uuid and career is distinct from %s::jsonb",
                    (Jsonb(career_json(context)), fight_id, Jsonb(career_json(context))),
                )
                changed += cur.rowcount
        return changed

    def decision_scorecards(self) -> list[tuple[str, int, list[str]]]:
        query = """
            select f.id::text as fight_id, extract(year from e.event_date)::int as year,
                   r.scorecards
            from public.fight_results r
            join public.fights f on f.id = r.fight_id
            join public.events e on e.id = f.event_id
            where r.method like 'Decision%' and r.outcome = 'win'
              and jsonb_typeof(r.scorecards) = 'array' and jsonb_array_length(r.scorecards) = 3
        """
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(query)
            rows = cur.fetchall()
        return [
            (row["fight_id"], row["year"], [str(card) for card in row["scorecards"]])
            for row in rows
        ]

    def fighter_names(self) -> list[tuple[str, str]]:
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute("select id::text as id, name from public.fighters")
            return [(row["id"], row["name"]) for row in cur.fetchall()]

    def prediction_fights(self) -> list[FightRow]:
        query = """
            select f.id::text as id, e.event_date, f.card_position, f.weight_class,
                   f.is_title_fight, f.fighter_a_id::text as a_id, f.fighter_b_id::text as b_id,
                   s.stars::float as stars
            from public.fights f
            join public.events e on e.id = f.event_id
            join public.excitement_scores s
              on s.fight_id = f.id
             and s.version = (select v.version from public.scoring_versions v where v.is_active)
        """
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(query)
            return [
                FightRow(
                    fight_id=row["id"],
                    event_date=row["event_date"],
                    position=row["card_position"],
                    weight_class=row["weight_class"],
                    is_title_fight=row["is_title_fight"],
                    a_id=row["a_id"],
                    b_id=row["b_id"],
                    stars=float(row["stars"]),
                )
                for row in cur.fetchall()
            ]

    def upcoming_bouts_for_prediction(self) -> list[UpcomingBoutInput]:
        query = """
            select b.id::text as id, b.card_position, b.weight_class, b.is_title_fight,
                   b.fighter_a_id::text as a_id, b.fighter_b_id::text as b_id,
                   count(*) over (partition by b.event_id) as card_size
            from public.upcoming_bouts b
            order by b.event_id, b.card_position
        """
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(query)
            return [
                UpcomingBoutInput(
                    bout_id=row["id"],
                    position=row["card_position"],
                    card_size=int(row["card_size"]),
                    weight_class=row["weight_class"],
                    is_title_fight=row["is_title_fight"],
                    a_id=row["a_id"],
                    b_id=row["b_id"],
                )
                for row in cur.fetchall()
            ]

    def set_upcoming_predictions(self, predictions: Sequence[UpcomingPrediction]) -> None:
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(
                "update public.upcoming_bouts set predicted_stars = null, prediction_basis = null,"
                " prediction_why = null, prediction_version = null"
            )
            for p in predictions:
                cur.execute(
                    "update public.upcoming_bouts set predicted_stars = %s, prediction_basis = %s,"
                    " prediction_why = %s, prediction_version = %s where id = %s::uuid",
                    (
                        p.stars,
                        p.basis,
                        Jsonb(
                            [{"label": r.label, "amount": round(r.amount, 3)} for r in p.reasons]
                        ),
                        p.version,
                        p.bout_id,
                    ),
                )

    def replace_upcoming(
        self, events: Sequence[UpcomingEvent], fighter_ids: Mapping[str, str], *, today: date
    ) -> None:
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute("delete from public.upcoming_events where event_date < %s", (today,))
            cur.execute(
                "delete from public.upcoming_events"
                " where event_date > %s and wiki_title <> all(%s)",
                (today, [e.wiki_title for e in events]),
            )
            for event in events:
                cur.execute(
                    "insert into public.upcoming_events"
                    " (wiki_title, name, slug, event_date, location)"
                    " values (%s, %s, %s, %s, %s)"
                    " on conflict (wiki_title) do update set name = excluded.name,"
                    " slug = excluded.slug, event_date = excluded.event_date,"
                    " location = excluded.location, updated_at = now()"
                    " returning id",
                    (event.wiki_title, event.name, event.slug, event.event_date, event.location),
                )
                event_id = cur.fetchone()["id"]  # type: ignore[index]
                cur.execute("delete from public.upcoming_bouts where event_id = %s", (event_id,))
                for bout in event.bouts:
                    cur.execute(
                        "insert into public.upcoming_bouts (event_id, card_position, segment,"
                        " weight_class, is_title_fight, fighter_a_name, fighter_b_name,"
                        " fighter_a_id, fighter_b_id)"
                        " values (%s, %s, %s, %s, %s, %s, %s, %s::uuid, %s::uuid)",
                        (
                            event_id,
                            bout.position,
                            bout.segment,
                            bout.weight_class,
                            bout.is_title_fight,
                            bout.a,
                            bout.b,
                            fighter_ids.get(bout.a),
                            fighter_ids.get(bout.b),
                        ),
                    )

    def replace_judge_stats(self, report: JudgeReport) -> int:
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute("delete from public.judge_stats")
            cur.execute("delete from public.judge_disputes")
            for d in report.disputes:
                cur.execute(
                    "insert into public.judge_disputes (judge_slug, fight_id, judge_card, margin,"
                    " lone, severity) values (%s, %s::uuid, %s, %s, %s, %s)",
                    (d.judge_slug, d.fight_id, d.judge_card, d.margin, d.lone, d.severity),
                )
            for j in report.judges:
                cur.execute(
                    "insert into public.judge_stats (slug, name, slugs, cards, dissent,"
                    " lone_dissent, abs_sum, abs_sumsq, first_year, last_year)"
                    " values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (
                        j.slug,
                        j.name,
                        j.slugs,
                        j.cards,
                        j.dissent,
                        j.lone_dissent,
                        j.abs_sum,
                        j.abs_sumsq,
                        j.first_year,
                        j.last_year,
                    ),
                )
            b = report.baseline
            cur.execute(
                "insert into public.judge_baseline (id, cards, dissent, abs_sum, abs_sumsq,"
                " judges_with_enough, updated_at) values (1, %s, %s, %s, %s, %s, now())"
                " on conflict (id) do update set cards = excluded.cards,"
                " dissent = excluded.dissent,"
                " abs_sum = excluded.abs_sum, abs_sumsq = excluded.abs_sumsq,"
                " judges_with_enough = excluded.judges_with_enough, updated_at = now()",
                (b.cards, b.dissent, b.abs_sum, b.abs_sumsq, b.judges_with_enough),
            )
        return len(report.judges)

    def rated_fights(self, min_stars: float) -> list[RatedFight]:
        query = """
            select f.id::text as fight_id, a.name as a_name, b.name as b_name,
                   e.name as event_name, s.stars
            from public.fights f
            join public.events e on e.id = f.event_id
            join public.fighters a on a.id = f.fighter_a_id
            join public.fighters b on b.id = f.fighter_b_id
            join public.excitement_scores s
              on s.fight_id = f.id
             and s.version = (select v.version from public.scoring_versions v where v.is_active)
            where s.stars >= %s
            order by e.event_date, f.card_position
        """
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(query, (min_stars,))
            rows = cur.fetchall()
        return [
            RatedFight(
                fight_id=row["fight_id"],
                fighter_a=row["a_name"],
                fighter_b=row["b_name"],
                event_name=row["event_name"],
                stars=float(row["stars"]),
            )
            for row in rows
        ]

    def set_fight_videos(self, videos_by_fight: Mapping[str, str], *, channel: str) -> int:
        changed = 0
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            for fight_id, video_id in videos_by_fight.items():
                cur.execute(
                    "insert into public.fight_videos (fight_id, youtube_id, channel)"
                    " values (%s::uuid, %s, %s)"
                    " on conflict (fight_id) do update"
                    "   set youtube_id = excluded.youtube_id, channel = excluded.channel"
                    " where public.fight_videos.youtube_id is distinct from excluded.youtube_id"
                    "    or public.fight_videos.channel is distinct from excluded.channel",
                    (fight_id, video_id, channel),
                )
                changed += cur.rowcount
        return changed

    def set_card_segments(self, source: str, segments_by_fight: Mapping[str, str]) -> int:
        if not segments_by_fight:
            return 0
        updated = 0
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            for fight_source_id, segment in segments_by_fight.items():
                cur.execute(
                    "update public.fights set card_segment = %s"
                    " where source = %s and source_id = %s",
                    (segment, source, fight_source_id),
                )
                updated += cur.rowcount
        return updated

    def labeled_fights(self, source: str) -> list[LabeledFight]:
        meta_query = """
            select f.id, e.source_id as event_source_id, e.event_date, f.card_position,
                   f.is_title_fight, r.bonuses,
                   count(*) over (partition by e.id) as fights_on_card
            from public.fights f
            join public.events e on e.id = f.event_id
            join public.fight_results r on r.fight_id = f.id
            where e.source = %s
              and exists (
                    select 1 from public.fights f2
                    join public.fight_results r2 on r2.fight_id = f2.id
                    where f2.event_id = e.id and cardinality(r2.bonuses) > 0)
        """
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(meta_query, (source,))
            meta = {str(row["id"]): row for row in cur.fetchall()}
        if not meta:
            return []
        event_ids = {row["event_source_id"] for row in meta.values()}
        labeled: list[LabeledFight] = []
        for item in self.scoring_inputs(source=source, event_source_ids=event_ids):
            row = meta.get(item.fight_id)
            if row is None:
                continue
            labeled.append(
                LabeledFight(
                    fight_id=item.fight_id,
                    event_source_id=item.event_source_id,
                    event_date=row["event_date"],
                    card_position=row["card_position"],
                    fights_on_card=row["fights_on_card"],
                    is_title_fight=row["is_title_fight"],
                    bonuses=tuple(row["bonuses"] or ()),
                    input=item.input,
                )
            )
        return labeled

    def events_for_bonus_matching(self, source: str, from_year: int) -> list[EventToLabel]:
        query = """
            select e.source_id as event_source_id, e.name as event_name, e.event_date,
                   f.source_id as fight_source_id, a.name as a_name, b.name as b_name
            from public.events e
            join public.fights f on f.event_id = e.id
            join public.fighters a on a.id = f.fighter_a_id
            join public.fighters b on b.id = f.fighter_b_id
            where e.source = %s and e.event_date >= make_date(%s, 1, 1)
            order by e.event_date, e.source_id, f.card_position
        """
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(query, (source, from_year))
            rows = cur.fetchall()
        grouped: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            grouped.setdefault(row["event_source_id"], []).append(row)
        return [
            EventToLabel(
                source_id=event_id,
                name=group[0]["event_name"],
                event_date=group[0]["event_date"],
                fights=tuple(
                    FightNames(r["fight_source_id"], (r["a_name"], r["b_name"])) for r in group
                ),
            )
            for event_id, group in grouped.items()
        ]

    def replace_version(
        self,
        config: ScoringConfig,
        reference: Reference,
        scored: Sequence[tuple[str, ScoredFight]],
        *,
        activate: bool,
    ) -> None:
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(
                """
                insert into public.scoring_versions (version, config, reference)
                values (%s, %s, %s)
                on conflict (version) do update
                  set config = excluded.config, reference = excluded.reference
                """,
                (config.version, Jsonb(config.to_json()), Jsonb(reference.to_json())),
            )
            cur.execute(
                "delete from public.excitement_scores where version = %s", (config.version,)
            )
            cur.execute(
                "delete from public.excitement_features where version = %s", (config.version,)
            )
            self._write_scores(cur, config.version, scored)
            if activate:
                cur.execute(
                    "update public.scoring_versions set is_active = false "
                    "where is_active and version <> %s",
                    (config.version,),
                )
                cur.execute(
                    "update public.scoring_versions set is_active = true where version = %s",
                    (config.version,),
                )

    @staticmethod
    def _write_scores(
        cur: psycopg.Cursor[dict[str, Any]],
        version: int,
        scored: Sequence[tuple[str, ScoredFight]],
    ) -> None:
        if not scored:
            return
        cur.executemany(
            """
            insert into public.excitement_features (fight_id, version, features, composite)
            values (%s, %s, %s, %s)
            on conflict (fight_id, version) do update
              set features = excluded.features, composite = excluded.composite, computed_at = now()
            """,
            [(fid, version, Jsonb(s.features_json()), s.composite) for fid, s in scored],
        )
        cur.executemany(
            """
            insert into public.excitement_scores (fight_id, version, percentile, stars)
            values (%s, %s, %s, %s)
            on conflict (fight_id, version) do update
              set percentile = excluded.percentile, stars = excluded.stars, computed_at = now()
            """,
            [(fid, version, s.percentile, s.stars) for fid, s in scored],
        )


def _ended_by(method: str | None, method_detail: str | None) -> str:
    """How a stored bout ended, as the career history needs it ("ko", "sub" or "other")."""
    if method is None or is_injury_stoppage(method, method_detail):
        return "other"
    kind = classify_method(method)
    if kind is MethodKind.KO_TKO:
        return "ko"
    return "sub" if kind is MethodKind.SUBMISSION else "other"
