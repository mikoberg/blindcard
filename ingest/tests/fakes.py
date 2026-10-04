"""In-memory stand-ins for the source and the repository (no network, no database)."""

from __future__ import annotations

import datetime as dt
from collections.abc import Collection, Sequence
from dataclasses import dataclass, field

from helpers import make_fight, rnd

from blindcard_ingest.db.repository import FightScoringInput, StoredScoringVersion
from blindcard_ingest.models import EventBundle, ParsedEvent, ParsedFight
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

    def scoring_inputs(
        self,
        *,
        source: str | None = None,
        event_source_ids: Collection[str] | None = None,
        missing_score_for_version: int | None = None,
    ) -> list[FightScoringInput]:
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

    def close(self) -> None:
        return None
