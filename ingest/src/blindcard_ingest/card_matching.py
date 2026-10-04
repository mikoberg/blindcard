"""Assign each fight of an event to its card segment, conservatively.

The segments come from a Wikipedia article's bout list. Rules (never guess), all or nothing:
  * every bout must carry a known segment header; an article with a plain "Fight card" (one
    part, nothing to separate) leaves the event without segments;
  * the article must list exactly as many bouts as we have fights;
  * a bout must resolve to ONE fight of our event: at least one of its names must match
    (same strict name steps as the bonus labels) and the other must not point at a different
    fight. A name that matches nothing is tolerated, because fighters change their names and
    our data holds the current one ("Tiago Trator" is now "Tiago dos Santos e Silva"). Every
    fight must be claimed by exactly one bout;
  * our card order (main event first) must run through the segments in order: main card, then
    prelims, then early prelims. A disagreement means one of the two orders is not what we think
    it is, so nothing is stored.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from blindcard_ingest.bonus_matching import EventIndex, FightNames
from blindcard_ingest.sources.wikipedia.card import EARLY_PRELIM, MAIN, PRELIM, CardBout

_RANK = {MAIN: 0, PRELIM: 1, EARLY_PRELIM: 2}

COMPLETE = "complete"
SINGLE_CARD = "single_card"
COUNT_MISMATCH = "count_mismatch"
UNMATCHED = "unmatched"
ORDER_MISMATCH = "order_mismatch"


@dataclass(frozen=True)
class SegmentResolution:
    status: str
    segments_by_fight: dict[str, str] = field(default_factory=dict)

    @property
    def complete(self) -> bool:
        return self.status == COMPLETE


def resolve_segments(bouts: Sequence[CardBout], fights: Sequence[FightNames]) -> SegmentResolution:
    """`fights` must be in card order (main event first)."""
    if any(bout.segment is None for bout in bouts):
        return SegmentResolution(SINGLE_CARD)
    if len(bouts) != len(fights):
        return SegmentResolution(COUNT_MISMATCH)

    index = EventIndex(fights)
    segment_of: dict[str, str] = {}
    for bout in bouts:
        fight_ids = {index.resolve(name) for name in bout.names} - {None}
        if len(fight_ids) != 1:
            return SegmentResolution(UNMATCHED)
        fight_id = next(iter(fight_ids))
        if fight_id is None or fight_id in segment_of:
            return SegmentResolution(UNMATCHED)
        segment_of[fight_id] = bout.segment or ""

    ranks = [_RANK[segment_of[fight.source_id]] for fight in fights]
    if ranks != sorted(ranks):
        return SegmentResolution(ORDER_MISMATCH)
    return SegmentResolution(COMPLETE, segment_of)
