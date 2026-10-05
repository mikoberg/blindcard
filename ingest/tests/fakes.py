"""In-memory stand-ins for the source and the repository (no network, no database)."""

from __future__ import annotations

import datetime as dt
from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from helpers import make_fight, rnd

from blindcard_ingest.bonus_matching import EventToLabel, FightNames
from blindcard_ingest.db.repository import (
    FightScoringInput,
    FightSides,
    LabeledFight,
    RatedFight,
    StoredScoringVersion,
)
from blindcard_ingest.judges import JudgeReport
from blindcard_ingest.models import EventBundle, ParsedEvent, ParsedFight
from blindcard_ingest.scoring.career import (
    CareerContext,
    HistoryBout,
    career_contexts,
    career_json,
)
from blindcard_ingest.scoring.config import ScoringConfig
from blindcard_ingest.scoring.features import ScoringInput
from blindcard_ingest.scoring.scorer import Reference, ScoredFight


def varied_fight(
    n: int, *, source_id: str, card_position: int, complete: bool = True, method: str | None = None
) -> ParsedFight:
    """A deterministic synthetic fight; `n` varies pace, finish and control."""
    a, b = f"a{source_id}", f"b{source_id}"
    finish = n % 3 == 0
    round_count = 1 + n % 3 if finish else 3
    rounds = []
    for r in range(1, round_count + 1):
        rounds.append(
            rnd(
                r,
                a,
                sig=5 + (n * 7 + r * 3) % 40,
                kd=1 if finish and r == round_count else 0,
                subs=n % 2,
                control=(n * 13) % 120,
            )
        )
        rounds.append(rnd(r, b, sig=5 + (n * 11 + r * 5) % 40))
    return make_fight(
        listing_first=b,  # listing order correlates with the winner; it must not matter
        listing_second=a,
        winner=b,
        rounds=rounds if complete else [],
        method=method or ("KO/TKO" if finish else "U-DEC"),
        end_round=round_count,
        end_time=120 if finish else 300,
        source_id=source_id,
        card_position=card_position,
    )


def make_bundle(
    event_id: str,
    date: dt.date,
    *,
    fights: int = 6,
    seed: int = 0,
    complete: bool = True,
    methods: dict[int, str] | None = None,
) -> EventBundle:
    return EventBundle(
        event=ParsedEvent(source_id=event_id, name=f"Event {event_id}", event_date=date),
        fights=[
            varied_fight(
                seed + i,
                source_id=f"{event_id}-f{i}",
                card_position=i + 1,
                complete=complete,
                method=(methods or {}).get(i),
            )
            for i in range(fights)
        ],
    )


class FakeSource:
    name = "fakesource"
    promotion = "UFC"

    def __init__(self, bundles: Sequence[EventBundle]) -> None:
        self.bundles: dict[str, EventBundle] = {b.event.source_id: b for b in bundles}
        self.failing: set[str] = set()
        self.fetch_calls: list[tuple[str, bool]] = []

    def list_completed_events(self) -> list[ParsedEvent]:
        return [b.event for b in self.bundles.values()]

    def fetch_event(self, event: ParsedEvent, *, refresh: bool = False) -> EventBundle:
        self.fetch_calls.append((event.source_id, refresh))
        if event.source_id in self.failing:
            raise RuntimeError(f"boom for {event.source_id}")
        return self.bundles[event.source_id]


@dataclass
class FakeRepository:
    events: dict[tuple[str, str], EventBundle] = field(default_factory=dict)
    versions: dict[int, tuple[ScoringConfig, Reference]] = field(default_factory=dict)
    active_version: int | None = None
    scores: dict[tuple[str, int], ScoredFight] = field(default_factory=dict)
    bonuses: dict[str, list[str]] = field(default_factory=dict)
    segments: dict[str, str] = field(default_factory=dict)
    career: dict[str, dict] = field(default_factory=dict)
    countries: dict[str, str] = field(default_factory=dict)
    records: dict[str, dict] = field(default_factory=dict)
    rated: list[RatedFight] = field(default_factory=list)
    videos: dict[str, str] = field(default_factory=dict)
    video_channel: str | None = None
    scorecards: list[tuple[int, list[str]]] = field(default_factory=list)
    judge_report: JudgeReport | None = None
    upserts: int = 0

    def complete_event_source_ids(self, source: str) -> set[str]:
        return {
            event_id
            for (src, event_id), bundle in self.events.items()
            if src == source
            and bundle.fights
            and all(not f.completeness_problems() for f in bundle.fights)
        }

    def upsert_event_bundle(self, source: str, promotion: str, bundle: EventBundle) -> None:
        self.upserts += 1
        self.events[(source, bundle.event.source_id)] = bundle

    def get_active_scoring_version(self) -> StoredScoringVersion | None:
        if self.active_version is None:
            return None
        config, reference = self.versions[self.active_version]
        return StoredScoringVersion(config=config, reference=reference)

    def _contexts(self) -> dict[str, CareerContext]:
        bouts = [
            HistoryBout(
                fight_id=fight.source_id,
                event_date=bundle.event.event_date,
                card_position=fight.card_position,
                is_title_fight=fight.is_title_fight,
                fighter_a=fight.fighter_a.source_id,
                fighter_b=fight.fighter_b.source_id,
                winner=fight.result.winner_source_id if fight.result else None,
                has_result=fight.result is not None,
                outcome=fight.result.outcome if fight.result else "win",
            )
            for bundle in self.events.values()
            for fight in bundle.fights
        ]
        return career_contexts(bouts)

    def scoring_inputs(
        self,
        *,
        source: str | None = None,
        event_source_ids: Collection[str] | None = None,
        missing_score_for_version: int | None = None,
    ) -> list[FightScoringInput]:
        contexts = self._contexts()
        items: list[FightScoringInput] = []
        for (src, event_id), bundle in sorted(self.events.items(), key=lambda kv: kv[0][1]):
            if source is not None and src != source:
                continue
            if event_source_ids is not None and event_id not in event_source_ids:
                continue
            for fight in bundle.fights:
                if fight.completeness_problems() or fight.result is None:
                    continue
                if (
                    missing_score_for_version is not None
                    and (fight.source_id, missing_score_for_version) in self.scores
                ):
                    continue
                items.append(
                    FightScoringInput(
                        fight_id=fight.source_id,
                        event_source_id=event_id,
                        input=ScoringInput(
                            scheduled_rounds=fight.scheduled_rounds,
                            method=fight.result.method,
                            end_round=fight.result.end_round,
                            end_time_seconds=fight.result.end_time_seconds,
                            rounds=fight.rounds,
                            card_position=fight.card_position,
                            is_title_fight=fight.is_title_fight,
                            context=contexts.get(fight.source_id),
                            method_detail=fight.result.method_detail,
                            event_year=bundle.event.event_date.year,
                        ),
                    )
                )
        return items

    def save_scores(self, version: int, scored: Sequence[tuple[str, ScoredFight]]) -> None:
        for fight_id, result in scored:
            self.scores[(fight_id, version)] = result

    def replace_version(
        self,
        config: ScoringConfig,
        reference: Reference,
        scored: Sequence[tuple[str, ScoredFight]],
        *,
        activate: bool,
    ) -> None:
        self.versions[config.version] = (config, reference)
        self.scores = {k: v for k, v in self.scores.items() if k[1] != config.version}
        self.save_scores(config.version, scored)
        if activate:
            self.active_version = config.version

    def set_bonuses(self, source: str, bonuses_by_fight: Mapping[str, Sequence[str]]) -> int:
        known = {
            fight.source_id
            for (src, _), bundle in self.events.items()
            if src == source
            for fight in bundle.fights
        }
        updated = 0
        for fight_source_id, bonuses in bonuses_by_fight.items():
            if fight_source_id in known:
                self.bonuses[fight_source_id] = list(bonuses)
                updated += 1
        return updated

    def fights_with_sides(self, source: str, from_year: int) -> list[FightSides]:
        return [
            FightSides(
                fight_source_id=fight.source_id,
                event_date=bundle.event.event_date,
                a_source_id=fight.fighter_a.source_id,
                a_name=fight.fighter_a.name,
                b_source_id=fight.fighter_b.source_id,
                b_name=fight.fighter_b.name,
                stored_records=self.records.get(fight.source_id),
            )
            for (src, _), bundle in self.events.items()
            if src == source and bundle.event.event_date.year >= from_year
            for fight in bundle.fights
        ]

    def set_fighter_countries(self, source: str, countries: Mapping[str, str]) -> int:
        changed = sum(1 for k, v in countries.items() if self.countries.get(k) != v)
        self.countries.update(countries)
        return changed

    def set_fight_records(self, source: str, records: Mapping[str, Mapping[str, Any]]) -> int:
        changed = 0
        for key, payload in records.items():
            merged = {**self.records.get(key, {}), **dict(payload)}
            if self.records.get(key) != merged:
                self.records[key] = merged
                changed += 1
        return changed

    def decision_scorecards(self) -> list[tuple[int, list[str]]]:
        return list(self.scorecards)

    def replace_judge_stats(self, report: JudgeReport) -> int:
        self.judge_report = report
        return len(report.judges)

    def rated_fights(self, min_stars: float) -> list[RatedFight]:
        return [fight for fight in self.rated if fight.stars >= min_stars]

    def set_fight_videos(self, videos_by_fight: Mapping[str, str], *, channel: str) -> int:
        changed = sum(1 for k, v in videos_by_fight.items() if self.videos.get(k) != v)
        self.videos.update(videos_by_fight)
        self.video_channel = channel
        return changed

    def refresh_career_context(self, source: str) -> int:
        changed = 0
        for fight_id, context in self._contexts().items():
            payload = career_json(context)
            if self.career.get(fight_id) != payload:
                self.career[fight_id] = payload
                changed += 1
        return changed

    def set_card_segments(self, source: str, segments_by_fight: Mapping[str, str]) -> int:
        known = {
            fight.source_id
            for (src, _), bundle in self.events.items()
            if src == source
            for fight in bundle.fights
        }
        updated = 0
        for fight_source_id, segment in segments_by_fight.items():
            if fight_source_id in known:
                self.segments[fight_source_id] = segment
                updated += 1
        return updated

    def labeled_fights(self, source: str) -> list[LabeledFight]:
        labeled: list[LabeledFight] = []
        for item in self.scoring_inputs(source=source):
            bundle = self.events[(source, item.event_source_id)]
            if not any(self.bonuses.get(f.source_id) for f in bundle.fights):
                continue
            fight = next(f for f in bundle.fights if f.source_id == item.fight_id)
            labeled.append(
                LabeledFight(
                    fight_id=item.fight_id,
                    event_source_id=item.event_source_id,
                    event_date=bundle.event.event_date,
                    card_position=fight.card_position,
                    fights_on_card=len(bundle.fights),
                    is_title_fight=fight.is_title_fight,
                    bonuses=tuple(self.bonuses.get(fight.source_id, ())),
                    input=item.input,
                )
            )
        return labeled

    def events_for_bonus_matching(self, source: str, from_year: int) -> list[EventToLabel]:
        return [
            EventToLabel(
                source_id=bundle.event.source_id,
                name=bundle.event.name,
                event_date=bundle.event.event_date,
                fights=tuple(
                    FightNames(f.source_id, (f.fighter_a.name, f.fighter_b.name))
                    for f in bundle.fights
                ),
            )
            for (src, _), bundle in sorted(
                self.events.items(), key=lambda kv: kv[1].event.event_date
            )
            if src == source and bundle.event.event_date.year >= from_year
        ]

    def close(self) -> None:
        return None
