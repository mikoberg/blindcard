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
from blindcard_ingest.models import EventBundle, ParsedFight, ParsedRound, slugify
from blindcard_ingest.scoring.career import HistoryBout, career_contexts, career_json
from blindcard_ingest.scoring.config import ScoringConfig
from blindcard_ingest.scoring.features import ScoringInput
from blindcard_ingest.scoring.scorer import Reference, ScoredFight

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

    def refresh_career_context(self, source: str) -> int:
        """Compute `fights.career` (rematch, streaks, unbeaten) for every fight of `source`.

        Built from the fighters' history before each bout. Returns how many rows changed.
        """
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
            select f.id, e.source_id as event_source_id, f.scheduled_rounds,
                   f.card_position, f.is_title_fight,
                   r.method, r.end_round, r.end_time_seconds
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
                ),
            )
            for row in fights
        ]

    def _history_bouts(self) -> list[HistoryBout]:
        """Every stored bout with who won, for the fighters' history (all sources)."""
        query = """
            select f.id, e.event_date, f.card_position, f.is_title_fight,
                   a.source_id as a_id, b.source_id as b_id, w.source_id as winner,
                   r.outcome, (r.fight_id is not null) as has_result
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
