"""Raw per-fight features for the excitement score.

Features are SPOILER DATA (finish, finish timing, duration): they stay private and are never
exposed to public queries. Only the resulting stars/percentile are public.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

from blindcard_ingest.models import SECONDS_PER_ROUND, ParsedFight, ParsedRound

#: The ten features of score v1. v1's config weights exactly these; they must keep their meaning.
V1_FEATURES: tuple[str, ...] = (
    "pace",
    "knockdowns",
    "sub_attempts",
    "reversals",
    "swings",
    "finish",
    "finish_lateness",
    "close_decision",
    "competitiveness",
    "control_share",
)

#: Candidate features for later score versions. Every one is always computed; a version's config
#: decides which it weights (the stored features of a version hold only those).
NEW_FEATURES: tuple[str, ...] = (
    "ko_finish",  # ended by KO/TKO
    "sub_finish",  # ended by submission
    "early_finish",  # 1 - fraction of the scheduled time used, for finishes (early = high)
    "time_fraction",  # fraction of the scheduled time used, finish or not
    "control_share_nofinish",  # control share, only when no finish came out of it (stalling)
    "knockdowns_both",  # both fighters scored a knockdown (back and forth)
    "min_pace",  # significant strikes per minute of the LESS active fighter
    "total_pace",  # total strikes landed per minute, both fighters
    "takedown_rate",  # takedowns landed per minute, both fighters
)

FEATURE_NAMES: tuple[str, ...] = V1_FEATURES + NEW_FEATURES

# Unbounded count/rate features: clipped at a reference quantile and scaled to 0..1.
CAPPED_FEATURES: tuple[str, ...] = (
    "pace",
    "knockdowns",
    "sub_attempts",
    "reversals",
    "swings",
    "min_pace",
    "total_pace",
    "takedown_rate",
)


class MethodKind(StrEnum):
    KO_TKO = "ko_tko"
    SUBMISSION = "submission"
    DECISION_UNANIMOUS = "decision_unanimous"
    DECISION_SPLIT = "decision_split"
    DECISION_MAJORITY = "decision_majority"
    DISQUALIFICATION = "disqualification"
    #: Could Not Continue, Overturned, Other: a defined, scoreable kind that counts as no finish.
    NO_RESULT = "no_result"
    #: A method string we have never seen. Never guessed: the fight stays unscored and is reported.
    UNKNOWN = "unknown"


def classify_method(method: str) -> MethodKind:
    """Map the source's method string to a kind.

    Unseen strings are UNKNOWN. They must not be scored by guesswork, and they must be loud:
    a fight without a score is itself visible to the public (see README, Phase 2 notes).
    """
    m = method.strip().upper()
    if m.startswith(("KO", "TKO")):
        return MethodKind.KO_TKO
    if m.startswith("SUB"):
        return MethodKind.SUBMISSION
    if m.startswith("U-DEC") or "UNANIMOUS" in m:
        return MethodKind.DECISION_UNANIMOUS
    if m.startswith("S-DEC") or "SPLIT" in m:
        return MethodKind.DECISION_SPLIT
    if m.startswith("M-DEC") or "MAJORITY" in m:
        return MethodKind.DECISION_MAJORITY
    if m.startswith(("DQ", "DISQUAL")):
        return MethodKind.DISQUALIFICATION
    if m.startswith(("COULD NOT CONTINUE", "OVERTURNED", "CNC", "OTHER")):
        return MethodKind.NO_RESULT
    return MethodKind.UNKNOWN


@dataclass(frozen=True)
class ScoringInput:
    """Everything the scorer needs, independent of where it was loaded from."""

    scheduled_rounds: int | None
    method: str
    end_round: int
    end_time_seconds: int
    rounds: Sequence[ParsedRound]

    @classmethod
    def from_fight(cls, fight: ParsedFight) -> ScoringInput:
        if fight.result is None:
            raise ValueError("fight has no result")
        return cls(
            scheduled_rounds=fight.scheduled_rounds,
            method=fight.result.method,
            end_round=fight.result.end_round,
            end_time_seconds=fight.result.end_time_seconds,
            rounds=fight.rounds,
        )

    @property
    def fight_seconds(self) -> int:
        return (self.end_round - 1) * SECONDS_PER_ROUND + self.end_time_seconds


def scoring_problems(inp: ScoringInput) -> list[str]:
    """Reasons this fight must stay unscored. Empty means it can be scored. Never guess."""
    problems: list[str] = []
    if classify_method(inp.method) is MethodKind.UNKNOWN:
        # No method value here: these messages end up in (possibly public) CI logs.
        problems.append("method not classifiable")
    if inp.scheduled_rounds is None:
        problems.append("scheduled rounds unknown")
    if inp.fight_seconds <= 0:
        problems.append("fight duration is zero")

    fighters = {r.fighter_source_id for r in inp.rounds}
    if len(fighters) != 2:
        problems.append(f"round data covers {len(fighters)} fighter(s), expected 2")
    by_round: dict[int, set[str]] = defaultdict(set)
    for r in inp.rounds:
        by_round[r.round_number].add(r.fighter_source_id)
    # No round numbers in these messages: the expected range is the finishing round.
    if set(by_round) != set(range(1, inp.end_round + 1)):
        problems.append("round data does not cover every round")
    if any(len(who) != 2 for who in by_round.values()):
        problems.append("a round lacks stats for one fighter")
    return problems


def compute_raw_features(inp: ScoringInput) -> dict[str, float]:
    """Compute the raw (un-normalised) features. Raises ValueError if the fight is unscorable."""
    problems = scoring_problems(inp)
    if problems:
        raise ValueError("; ".join(problems))
    assert inp.scheduled_rounds is not None

    minutes = inp.fight_seconds / 60
    kind = classify_method(inp.method)

    sig_landed: dict[str, int] = defaultdict(int)
    knockdowns_by_fighter: dict[str, int] = defaultdict(int)
    knockdowns_by_round: dict[int, dict[str, int]] = defaultdict(dict)
    sig_by_round: dict[int, dict[str, int]] = defaultdict(dict)
    total_knockdowns = total_subs = total_reversals = total_control = 0
    total_strikes = total_takedowns = 0
    for r in inp.rounds:
        sig_landed[r.fighter_source_id] += r.sig_strikes_landed
        sig_by_round[r.round_number][r.fighter_source_id] = r.sig_strikes_landed
        knockdowns_by_round[r.round_number][r.fighter_source_id] = r.knockdowns
        knockdowns_by_fighter[r.fighter_source_id] += r.knockdowns
        total_knockdowns += r.knockdowns
        total_subs += r.sub_attempts
        total_reversals += r.reversals
        total_control += r.control_seconds
        total_strikes += r.total_strikes_landed
        total_takedowns += r.takedowns_landed

    total_sig = sum(sig_landed.values())
    first, second = sorted(sig_landed)

    swings = 0
    last_leader: str | None = None
    for number in sorted(sig_by_round):
        leader = _round_leader(sig_by_round[number], knockdowns_by_round[number], first, second)
        if leader is None:
            continue
        if last_leader is not None and leader != last_leader:
            swings += 1
        last_leader = leader

    finished = kind in (MethodKind.KO_TKO, MethodKind.SUBMISSION)
    scheduled_seconds = inp.scheduled_rounds * SECONDS_PER_ROUND
    time_fraction = min(inp.fight_seconds / scheduled_seconds, 1.0)
    control_share = min(total_control / inp.fight_seconds, 1.0)

    return {
        "pace": total_sig / minutes,
        "knockdowns": float(total_knockdowns),
        "sub_attempts": float(total_subs),
        "reversals": float(total_reversals),
        "swings": float(swings),
        "finish": 1.0 if finished else 0.0,
        "finish_lateness": min(inp.fight_seconds / scheduled_seconds, 1.0) if finished else 0.0,
        "close_decision": (
            1.0 if kind in (MethodKind.DECISION_SPLIT, MethodKind.DECISION_MAJORITY) else 0.0
        ),
        "competitiveness": (
            1.0 - abs(sig_landed[first] - sig_landed[second]) / total_sig if total_sig else 0.0
        ),
        "control_share": control_share,
        "ko_finish": 1.0 if kind is MethodKind.KO_TKO else 0.0,
        "sub_finish": 1.0 if kind is MethodKind.SUBMISSION else 0.0,
        "early_finish": 1.0 - time_fraction if finished else 0.0,
        "time_fraction": time_fraction,
        "control_share_nofinish": 0.0 if finished else control_share,
        "knockdowns_both": 1.0
        if all(knockdowns_by_fighter[f] > 0 for f in (first, second))
        else 0.0,
        "min_pace": min(sig_landed[first], sig_landed[second]) / minutes,
        "total_pace": total_strikes / minutes,
        "takedown_rate": total_takedowns / minutes,
    }


def _round_leader(
    sig: dict[str, int], knockdowns: dict[str, int], first: str, second: str
) -> str | None:
    """Who led the round: more significant strikes, knockdowns as tiebreak, else nobody."""
    if sig[first] != sig[second]:
        return first if sig[first] > sig[second] else second
    if knockdowns[first] != knockdowns[second]:
        return first if knockdowns[first] > knockdowns[second] else second
    return None
