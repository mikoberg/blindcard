"""Repository: the only place that talks SQL.

`Repository` is the contract the pipeline depends on. `PostgresRepository` implements it with
psycopg 3. Writes are idempotent upserts keyed on natural keys, one transaction per event.
"""

from __future__ import annotations

import json
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

from blindcard_ingest.audit import ScoredEvent
from blindcard_ingest.bonus_matching import EventToLabel, FightNames
from blindcard_ingest.judges import JudgeReport
from blindcard_ingest.models import EventBundle, ParsedFight, ParsedRound, slugify
from blindcard_ingest.predict.dataset import FightRow
from blindcard_ingest.predict.types import (
    EloBefore,
    EloFight,
    EloRow,
    EloStep,
    FightElo,
    FighterNow,
    FightOutcome,
    RankBout,
    UpcomingBoutInput,
    UpcomingElo,
    UpcomingPick,
    UpcomingPrediction,
)
from blindcard_ingest.predict.winner import dominance_of
from blindcard_ingest.scoring.career import HistoryBout, career_contexts, career_json
from blindcard_ingest.scoring.config import ScoringConfig
from blindcard_ingest.scoring.features import (
    MethodKind,
    ScoringInput,
    classify_method,
    is_injury_stoppage,
)
from blindcard_ingest.scoring.scorer import Reference, ScoredFight
from blindcard_ingest.sources.wikipedia.fighter_record import RecordRow
from blindcard_ingest.sources.wikipedia.fighter_style import merge_styles
from blindcard_ingest.upcoming import UpcomingEvent
from blindcard_ingest.upcoming_records import current_record, with_later_bouts

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class StyleCandidate:
    """A fighter whose style the official athlete page has not been asked about."""

    fighter_id: str
    name: str


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


def _decision_label(method: str | None) -> str:
    """How a win was decided, in the few words the Elo history shows (never the source's string)."""
    kind = classify_method(method or "")
    if kind in (MethodKind.KO_TKO, MethodKind.SUBMISSION):
        return "finish"
    if kind is MethodKind.DECISION_SPLIT:
        return "split decision"
    if kind is MethodKind.DECISION_MAJORITY:
        return "majority decision"
    if kind is MethodKind.DISQUALIFICATION:
        return "disqualification"
    return "unanimous decision" if kind is MethodKind.DECISION_UNANIMOUS else "other"


def _elo_outcome(outcome: str | None, has_winner: bool) -> str:
    """ "win" / "draw" for a result Elo can use, "none" for anything else (a no contest)."""
    if outcome == "draw":
        return "draw"
    return "win" if outcome == "win" and has_winner else "none"


def _side_json(side: EloBefore | None) -> str | None:
    return None if side is None else json.dumps({"r": side.rating, "n": side.fights})


def _elo_json(a: EloBefore | None, b: EloBefore | None) -> str | None:
    """`fights.elo`: {"a": {"r": rating, "n": fights}, "b": {...}}, a side left out when unknown."""
    payload = {k: {"r": s.rating, "n": s.fights} for k, s in (("a", a), ("b", b)) if s is not None}
    return json.dumps(payload) if payload else None


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

    def refresh_fighter_awards(self) -> int:
        """Rebuild `fighters.awards` ({"fotn": n, "potn": n}, a public current-standing total) from
        the private bonus labels: a Fight of the Night counts for both fighters of the fight, a
        Performance of the Night for its winner, and only fights of events whose awards are stored
        count. Returns how many fighters have awards now."""
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

    def set_fighter_styles(self, source: str, styles: Mapping[str, Sequence[str]]) -> int:
        """Add style labels to fighters by source id (kept with what is stored, at most three);
        returns how many rows changed."""
        ...

    def set_fighter_bouts(self, source: str, bouts: Mapping[str, Sequence[RecordRow]]) -> int:
        """Replace, per fighter (by source id), the bouts of their career that are not in our own
        data (RESULT DATA: a private table, shown only after a click). Returns the rows written."""
        ...

    def rank_bouts(self, from_year: int) -> list[RankBout]:
        """Stored fights from `from_year` on, with the weight class and both names."""
        ...

    def rank_bouts_upcoming(self) -> list[RankBout]:
        """Announced bouts, with the weight class and both names."""
        ...

    def set_fight_ranks(self, ranks: Mapping[str, tuple[int | None, int | None]]) -> int:
        """Store the UFC rank of both fighters going into each fight (`fights.ranks`, public:
        pre-fight only; 0 = champion), by fight id. A fight with no ranked fighter has none."""
        ...

    def set_upcoming_ranks(self, ranks: Mapping[str, tuple[int | None, int | None]]) -> int:
        """Store the current UFC rank of both fighters of each announced bout, by bout id."""
        ...

    def fighters_for_ufc_styles(self, limit: int, *, older_than_days: int) -> list[StyleCandidate]:
        """Fighters with no style yet whose official page was not read within `older_than_days`:
        those on an announced card first, then the most recently active."""
        ...

    def set_ufc_styles(self, results: Mapping[str, Sequence[str] | None]) -> int:
        """Record that the official page of each fighter (by id) was read, adding the labels found
        (None or empty: nothing specific, but it is not asked again for a while)."""
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

    def scored_events(self) -> list[ScoredEvent]:
        """Every event with the public stars of its fights, by the active score version."""
        ...

    def winner_outcomes(self) -> list[FightOutcome]:
        """Every decisive completed fight (RESULT DATA: it stays in the ingest process)."""
        ...

    def set_upcoming_picks(self, picks: Sequence[UpcomingPick]) -> None:
        """Store who is favoured (private); a bout without one in `picks` loses any old one."""
        ...

    def elo_fights(self) -> list[EloFight]:
        """Every completed fight, with the result Elo can use: a win, a draw, or "none" for a no
        contest (RESULT DATA: it stays in the ingest process)."""
        ...

    def set_fight_elo(self, rows: Sequence[FightElo]) -> None:
        """Store the Elo going into every completed fight (`fights.elo`, public: pre-fight only)."""
        ...

    def set_upcoming_elo(self, rows: Sequence[UpcomingElo]) -> None:
        """Store the current Elo of the fighters of each announced bout (public, like records)."""
        ...

    def set_fighters_now(self, rows: Sequence[FighterNow]) -> None:
        """Store each fighter's record and Elo as of today (`fighters.record` / `fighters.elo`).
        Fighters not in `rows` lose any old values."""
        ...

    def set_fighter_elo(self, rows: Sequence[EloRow], steps: Sequence[EloStep]) -> None:
        """Replace the private Elo board and the history behind it (RESULT-DERIVED: served only
        after a click)."""
        ...

    def fighter_current_records(self, fighter_ids: Collection[str]) -> dict[str, dict[str, int]]:
        """The record each fighter brings into their next bout: the record going into their latest
        completed fight plus its result. Fighters without a reliable one are left out."""
        ...

    def replace_upcoming(
        self,
        events: Sequence[UpcomingEvent],
        fighter_ids: Mapping[str, str],
        *,
        today: date,
        records: Mapping[str, Mapping[str, int]] | None = None,
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

    def old_score_versions(self, keep: int) -> list[int]:
        """The versions whose per-fight scores and features can be dropped: all but the active one
        and the newest others, `keep` versions in total. Their config stays in scoring_versions."""
        ...

    def prune_score_versions(self, versions: Sequence[int]) -> tuple[int, int]:
        """Delete the per-fight scores and features of these versions (never the active one).
        Returns (scores deleted, features deleted)."""
        ...

    def reclaim_score_space(self) -> None:
        """Give the disk space of deleted scores back (VACUUM FULL: locks the two tables)."""
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


def _json_or_none(value: Mapping[str, int] | None) -> Jsonb | None:
    return Jsonb(dict(value)) if value is not None else None


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

    def refresh_fighter_awards(self) -> int:
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute("update public.fighters set awards = null where awards is not null")
            cur.execute(
                """
                update public.fighters f
                set awards = jsonb_build_object('fotn', a.fotn, 'potn', a.potn)
                from (
                    select side.fighter_id,
                           count(*) filter (
                               where 'fight_of_the_night' = any(r.bonuses)
                           )::int as fotn,
                           count(*) filter (
                               where 'performance_of_the_night' = any(r.bonuses)
                                 and r.winner_fighter_id = side.fighter_id
                           )::int as potn
                    from public.fights fi
                    join public.fight_results r on r.fight_id = fi.id
                    cross join lateral (
                        values (fi.fighter_a_id), (fi.fighter_b_id)
                    ) as side(fighter_id)
                    where exists (
                        select 1
                        from public.fights f2
                        join public.fight_results r2 on r2.fight_id = f2.id
                        where f2.event_id = fi.event_id and cardinality(r2.bonuses) > 0
                    )
                    group by side.fighter_id
                ) a
                where f.id = a.fighter_id
                """
            )
            return cur.rowcount

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

    def set_fighter_styles(self, source: str, styles: Mapping[str, Sequence[str]]) -> int:
        changed = 0
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            for fighter_source_id, labels in styles.items():
                cur.execute(
                    "select style from public.fighters where source = %s and source_id = %s",
                    (source, fighter_source_id),
                )
                row = cur.fetchone()
                if row is None:
                    continue
                merged = merge_styles(list(labels), list(row["style"]))
                if merged == list(row["style"]):
                    continue
                cur.execute(
                    "update public.fighters set style = %s where source = %s and source_id = %s",
                    (merged, source, fighter_source_id),
                )
                changed += cur.rowcount
        return changed

    def set_fighter_bouts(self, source: str, bouts: Mapping[str, Sequence[RecordRow]]) -> int:
        source_ids = list(bouts)
        flat = [(sid, row) for sid, rows in bouts.items() for row in rows]
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(
                "delete from public.fighter_bouts where fighter_id in"
                " (select id from public.fighters where source = %s and source_id = any(%s))",
                (source, source_ids),
            )
            if not flat:
                return 0
            cur.execute(
                "insert into public.fighter_bouts"
                " (fighter_id, bout_date, opponent, result, method, event_name, round)"
                " select f.id, v.d, v.opp, v.res, v.meth, v.ev, v.rnd"
                " from unnest(%s::text[], %s::date[], %s::text[], %s::text[], %s::text[],"
                "             %s::text[], %s::int[]) as v(sid, d, opp, res, meth, ev, rnd)"
                " join public.fighters f on f.source = %s and f.source_id = v.sid"
                " on conflict do nothing",
                (
                    [sid for sid, _ in flat],
                    [row.date for _, row in flat],
                    [row.opponent for _, row in flat],
                    [row.result for _, row in flat],
                    [row.method for _, row in flat],
                    [row.event for _, row in flat],
                    [row.round for _, row in flat],
                    source,
                ),
            )
            return cur.rowcount

    def rank_bouts(self, from_year: int) -> list[RankBout]:
        query = """
            select f.id::text as key, e.event_date, f.weight_class,
                   a.name as a_name, b.name as b_name
            from public.fights f
            join public.events e on e.id = f.event_id
            join public.fighters a on a.id = f.fighter_a_id
            join public.fighters b on b.id = f.fighter_b_id
            where e.event_date >= make_date(%s, 1, 1)
            order by e.event_date, f.card_position
        """
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(query, (from_year,))
            return [RankBout(**row) for row in cur.fetchall()]

    def rank_bouts_upcoming(self) -> list[RankBout]:
        query = """
            select b.id::text as key, e.event_date, b.weight_class,
                   b.fighter_a_name as a_name, b.fighter_b_name as b_name
            from public.upcoming_bouts b
            join public.upcoming_events e on e.id = b.event_id
            order by e.event_date, b.card_position
        """
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(query)
            return [RankBout(**row) for row in cur.fetchall()]

    def set_fight_ranks(self, ranks: Mapping[str, tuple[int | None, int | None]]) -> int:
        if not ranks:
            return 0
        ids = list(ranks)
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(
                "update public.fights f set ranks = case"
                "   when v.a is null and v.b is null then null"
                "   else jsonb_strip_nulls(jsonb_build_object('a', v.a, 'b', v.b)) end"
                " from unnest(%s::uuid[], %s::int[], %s::int[]) as v(id, a, b)"
                " where f.id = v.id and f.ranks is distinct from case"
                "   when v.a is null and v.b is null then null"
                "   else jsonb_strip_nulls(jsonb_build_object('a', v.a, 'b', v.b)) end",
                (ids, [ranks[i][0] for i in ids], [ranks[i][1] for i in ids]),
            )
            return cur.rowcount

    def set_upcoming_ranks(self, ranks: Mapping[str, tuple[int | None, int | None]]) -> int:
        ids = list(ranks)
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(
                "update public.upcoming_bouts set fighter_a_rank = null, fighter_b_rank = null"
            )
            if not ids:
                return 0
            cur.execute(
                "update public.upcoming_bouts b set fighter_a_rank = v.a, fighter_b_rank = v.b"
                " from unnest(%s::uuid[], %s::int[], %s::int[]) as v(id, a, b) where b.id = v.id",
                (ids, [ranks[i][0] for i in ids], [ranks[i][1] for i in ids]),
            )
            return cur.rowcount

    def fighters_for_ufc_styles(self, limit: int, *, older_than_days: int) -> list[StyleCandidate]:
        query = """
            select f.id::text as id, f.name,
                   (exists (select 1 from public.upcoming_bouts b
                            where b.fighter_a_id = f.id or b.fighter_b_id = f.id)) as upcoming,
                   (select max(e.event_date) from public.fights x
                      join public.events e on e.id = x.event_id
                     where x.fighter_a_id = f.id or x.fighter_b_id = f.id) as last_fight
            from public.fighters f
            where cardinality(f.style) = 0
              and (f.style_ufc_checked_at is null
                   or f.style_ufc_checked_at < now() - make_interval(days => %s))
            order by upcoming desc, last_fight desc nulls last, f.name
            limit %s
        """
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(query, (older_than_days, limit))
            return [StyleCandidate(row["id"], row["name"]) for row in cur.fetchall()]

    def set_ufc_styles(self, results: Mapping[str, Sequence[str] | None]) -> int:
        changed = 0
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            for fighter_id, labels in results.items():
                cur.execute(
                    "update public.fighters set style_ufc_checked_at = now(),"
                    " style = case when cardinality(style) = 0 then %s::text[] else style end"
                    " where id = %s::uuid",
                    (merge_styles(list(labels or [])), fighter_id),
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

    def scored_events(self) -> list[ScoredEvent]:
        query = """
            select e.event_date, e.name, array_agg(s.stars::float order by f.card_position) as stars
            from public.events e
            join public.fights f on f.event_id = e.id
            join public.excitement_scores s
              on s.fight_id = f.id
             and s.version = (select v.version from public.scoring_versions v where v.is_active)
            group by e.id
            order by e.event_date
        """
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(query)
            return [
                ScoredEvent(row["event_date"], row["name"], tuple(row["stars"]))
                for row in cur.fetchall()
            ]

    def winner_outcomes(self) -> list[FightOutcome]:
        query = """
            select f.id::text as id, e.event_date, f.fighter_a_id::text as a_id,
                   f.fighter_b_id::text as b_id, (r.winner_fighter_id = f.fighter_a_id) as a_won,
                   r.method
            from public.fights f
            join public.events e on e.id = f.event_id
            join public.fight_results r on r.fight_id = f.id
            where r.outcome = 'win' and r.winner_fighter_id is not null
        """
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(query)
            return [
                FightOutcome(
                    fight_id=row["id"],
                    event_date=row["event_date"],
                    a_id=row["a_id"],
                    b_id=row["b_id"],
                    a_won=bool(row["a_won"]),
                    dominance=dominance_of(row["method"]),
                )
                for row in cur.fetchall()
            ]

    def set_upcoming_picks(self, picks: Sequence[UpcomingPick]) -> None:
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute("delete from public.upcoming_picks")
            cur.execute("update public.upcoming_bouts set has_pick = false")
            for p in picks:
                cur.execute(
                    "insert into public.upcoming_picks (bout_id, favoured, probability, basis,"
                    " accuracy, version) values (%s::uuid, %s, %s, %s, %s, %s)",
                    (p.bout_id, p.favoured, p.probability, p.basis, p.accuracy, p.version),
                )
                cur.execute(
                    "update public.upcoming_bouts set has_pick = true where id = %s::uuid",
                    (p.bout_id,),
                )

    def elo_fights(self) -> list[EloFight]:
        # Every fight, also those without a usable result: they still get their pre-fight ratings,
        # so a no contest looks like every other fight on the card.
        query = """
            select f.id::text as id, e.event_date, f.fighter_a_id::text as a_id,
                   f.fighter_b_id::text as b_id, r.outcome,
                   coalesce(r.winner_fighter_id = f.fighter_a_id, false) as a_won, r.method,
                   (r.winner_fighter_id is not null) as has_winner
            from public.fights f
            join public.events e on e.id = f.event_id
            left join public.fight_results r on r.fight_id = f.id
        """
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(query)
            return [
                EloFight(
                    fight_id=row["id"],
                    event_date=row["event_date"],
                    a_id=row["a_id"],
                    b_id=row["b_id"],
                    outcome=_elo_outcome(row["outcome"], bool(row["has_winner"])),
                    a_won=bool(row["a_won"]),
                    how=_decision_label(row["method"]),
                )
                for row in cur.fetchall()
            ]

    def set_fight_elo(self, rows: Sequence[FightElo]) -> None:
        ids = [r.fight_id for r in rows]
        payloads = [_elo_json(r.a, r.b) for r in rows]
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(
                "update public.fights f set elo = v.elo::jsonb"
                " from unnest(%s::uuid[], %s::text[]) as v(id, elo)"
                " where f.id = v.id and f.elo is distinct from v.elo::jsonb",
                (ids, payloads),
            )

    def set_upcoming_elo(self, rows: Sequence[UpcomingElo]) -> None:
        ids = [r.bout_id for r in rows]
        a_side = [_side_json(r.a) for r in rows]
        b_side = [_side_json(r.b) for r in rows]
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(
                "update public.upcoming_bouts set fighter_a_elo = null, fighter_b_elo = null"
            )
            cur.execute(
                "update public.upcoming_bouts b"
                " set fighter_a_elo = v.a::jsonb, fighter_b_elo = v.b::jsonb"
                " from unnest(%s::uuid[], %s::text[], %s::text[]) as v(id, a, b)"
                " where b.id = v.id",
                (ids, a_side, b_side),
            )

    def set_fighters_now(self, rows: Sequence[FighterNow]) -> None:
        ids = [r.fighter_id for r in rows]
        records = [None if r.record is None else json.dumps(r.record) for r in rows]
        elos = [_side_json(r.elo) for r in rows]
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute("update public.fighters set record = null, elo = null")
            cur.execute(
                "update public.fighters f set record = v.record::jsonb, elo = v.elo::jsonb"
                " from unnest(%s::uuid[], %s::text[], %s::text[]) as v(id, record, elo)"
                " where f.id = v.id",
                (ids, records, elos),
            )

    def set_fighter_elo(self, rows: Sequence[EloRow], steps: Sequence[EloStep]) -> None:
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute("delete from public.fighter_elo_steps")
            cur.execute("delete from public.fighter_elo")
            for r in rows:
                cur.execute(
                    "insert into public.fighter_elo"
                    " (fighter_id, rating, fights, last_fight, peak, peak_date, version)"
                    " values (%s::uuid, %s, %s, %s, %s, %s, %s)",
                    (
                        r.fighter_id,
                        r.rating,
                        r.fights,
                        r.last_fight,
                        r.peak,
                        r.peak_date,
                        r.version,
                    ),
                )
            for s in steps:
                cur.execute(
                    "insert into public.fighter_elo_steps (fighter_id, seq, fight_id, fight_date,"
                    " opponent_id, score, how, rating_before, opponent_rating, expected, k,"
                    " change, rating_after) values (%s::uuid, %s, %s::uuid, %s, %s::uuid, %s, %s,"
                    " %s, %s, %s, %s, %s, %s)",
                    (
                        s.fighter_id,
                        s.seq,
                        s.fight_id,
                        s.fight_date,
                        s.opponent_id,
                        s.score,
                        s.how,
                        s.rating_before,
                        s.opponent_rating,
                        s.expected,
                        s.k,
                        s.change,
                        s.rating_after,
                    ),
                )

    def fighter_current_records(self, fighter_ids: Collection[str]) -> dict[str, dict[str, int]]:
        if not fighter_ids:
            return {}
        query = """
            select distinct on (x.fid) x.fid::text as fid,
                   case when f.fighter_a_id = x.fid then f.records -> 'a' else f.records -> 'b' end
                     as going_in,
                   r.outcome, (r.winner_fighter_id = x.fid) as won,
                   r.winner_fighter_id is null as open, e.event_date as last_date
            from (select unnest(%s::uuid[]) as fid) x
            join public.fights f on f.fighter_a_id = x.fid or f.fighter_b_id = x.fid
            join public.events e on e.id = f.event_id
            join public.fight_results r on r.fight_id = f.id
            order by x.fid, e.event_date desc, f.card_position desc
        """
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(query, (list(fighter_ids),))
            rows = cur.fetchall()
        # Bouts after the latest fight we store (other promotions, from the fighter's Wikipedia
        # table) are not in that fight's record going in, so they are added.
        later_query = """
            select b.fighter_id::text as fid, b.result, count(*) as n
            from public.fighter_bouts b
            join (select unnest(%s::uuid[]) as fid, unnest(%s::date[]) as last_date) x
              on x.fid = b.fighter_id and b.bout_date > x.last_date
            group by 1, 2
        """
        records: dict[str, dict[str, int]] = {}
        last_dates: dict[str, date] = {}
        for row in rows:
            record = current_record(
                row["going_in"], row["outcome"], None if row["open"] else row["won"]
            )
            if record is not None:
                records[row["fid"]] = record
                last_dates[row["fid"]] = row["last_date"]
        if records:
            with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
                cur.execute(later_query, (list(last_dates), list(last_dates.values())))
                later: dict[str, dict[str, int]] = {}
                for row in cur.fetchall():
                    later.setdefault(row["fid"], {})[row["result"]] = int(row["n"])
            for fid, counts in later.items():
                records[fid] = with_later_bouts(records[fid], counts)
        return records

    def replace_upcoming(
        self,
        events: Sequence[UpcomingEvent],
        fighter_ids: Mapping[str, str],
        *,
        today: date,
        records: Mapping[str, Mapping[str, int]] | None = None,
    ) -> None:
        records = records or {}
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
                    " (wiki_title, name, slug, event_date, location, main_card_at, prelims_at,"
                    " early_prelims_at)"
                    " values (%s, %s, %s, %s, %s, %s, %s, %s)"
                    " on conflict (wiki_title) do update set name = excluded.name,"
                    " slug = excluded.slug, event_date = excluded.event_date,"
                    " location = excluded.location,"
                    # a failed read must not erase a time we already know
                    " main_card_at = coalesce(excluded.main_card_at, upcoming_events.main_card_at),"
                    " prelims_at = coalesce(excluded.prelims_at, upcoming_events.prelims_at),"
                    " early_prelims_at = coalesce("
                    "excluded.early_prelims_at, upcoming_events.early_prelims_at),"
                    " updated_at = now()"
                    " returning id",
                    (
                        event.wiki_title,
                        event.name,
                        event.slug,
                        event.event_date,
                        event.location,
                        event.main_card_at,
                        event.prelims_at,
                        event.early_prelims_at,
                    ),
                )
                event_id = cur.fetchone()["id"]  # type: ignore[index]
                cur.execute("delete from public.upcoming_bouts where event_id = %s", (event_id,))
                for bout in event.bouts:
                    cur.execute(
                        "insert into public.upcoming_bouts (event_id, card_position, segment,"
                        " weight_class, is_title_fight, fighter_a_name, fighter_b_name,"
                        " fighter_a_id, fighter_b_id, fighter_a_record, fighter_b_record,"
                        " fighter_a_style, fighter_b_style)"
                        " values (%s, %s, %s, %s, %s, %s, %s, %s::uuid, %s::uuid, %s, %s, %s, %s)",
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
                            _json_or_none(records.get(fighter_ids.get(bout.a, ""))),
                            _json_or_none(records.get(fighter_ids.get(bout.b, ""))),
                            list(bout.a_style),
                            list(bout.b_style),
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

    def old_score_versions(self, keep: int) -> list[int]:
        query = """
            with kept as (
              select version from public.scoring_versions
              order by is_active desc, version desc limit %s
            )
            select version from public.scoring_versions
            where version not in (select version from kept) order by version
        """
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(query, (max(keep, 1),))
            return [row["version"] for row in cur.fetchall()]

    def prune_score_versions(self, versions: Sequence[int]) -> tuple[int, int]:
        if not versions:
            return 0, 0
        with sanitized_db_errors(), self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(
                "select count(*) as n from public.scoring_versions"
                " where version = any(%s) and is_active",
                (list(versions),),
            )
            if cur.fetchone()["n"]:
                raise RepositoryError("refusing to prune the active score version")
            cur.execute(
                "delete from public.excitement_features where version = any(%s)", (list(versions),)
            )
            features = cur.rowcount
            cur.execute(
                "delete from public.excitement_scores where version = any(%s)", (list(versions),)
            )
            return cur.rowcount, features

    def reclaim_score_space(self) -> None:
        # VACUUM cannot run inside a transaction: end it, switch to autocommit, switch back.
        with sanitized_db_errors():
            self._conn.commit()
            self._conn.autocommit = True
            try:
                for table in ("excitement_features", "excitement_scores"):
                    self._conn.execute(f"vacuum full public.{table}")
            finally:
                self._conn.autocommit = False

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
