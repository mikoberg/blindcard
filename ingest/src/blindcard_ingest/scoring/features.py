"""Raw per-fight features for the excitement score.

Features are SPOILER DATA (finish, finish timing, duration): they stay private and are never
exposed to public queries. Only the resulting stars/percentile are public.
"""

from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

from blindcard_ingest.models import SECONDS_PER_ROUND, ParsedFight, ParsedRound
from blindcard_ingest.scoring.career import KO_PRONE_USUAL, CareerContext

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
    # Stakes: announced before the fight, so they say nothing about how it went.
    "main_event",  # card position 1
    "co_main",  # card position 2
    "title_fight",  # a championship bout
    "volume",  # significant strikes landed over the whole fight, both fighters
    "five_rounds",  # scheduled for five rounds
    # Career context: what was known about the two fighters before the bout.
    "rematch",  # they have fought each other before
    "streak",  # the two fighters' current win streaks, added
    "star_power",  # their earlier main events and title fights, added
    "unbeaten_fighter",  # at least one of them has no UFC loss (after a few fights)
    "experience",  # UFC fights of the less experienced of the two
    # A finish that took real action: a stoppage because of an injury is not one.
    "real_finish",  # KO/TKO or submission, unless it ended because of an injury
    "real_early_finish",  # early_finish, for real finishes only
    "cut_short",  # share of the scheduled time not fought, if an injury or CNC ended it
    # Finishes the fighters' own history made likely (pre-fight facts, the same for both sides).
    "expected_finish",  # real_finish x how often the two fighters' earlier fights finished
    "expected_ko",  # KO/TKO x how often the more fragile of the two was stopped by KO/TKO before
    "fragile_ko",  # KO/TKO x how far that share is above the usual one (only above counts)
    # Bookkeeping, never weighted: the year of the event, for era-relative pace and volume.
    "event_year",
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
    "volume",
    "streak",
    "star_power",
    "experience",
    "expected_finish",
    "expected_ko",
    "fragile_ko",
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


_INJURY = re.compile(r"injur", re.IGNORECASE)


def is_injury_stoppage(method: str, method_detail: str | None) -> bool:
    """A KO/TKO or submission that the source describes as ending because of an injury.

    The fight stopped because someone could not go on, not because of what the other fighter
    did; it must not earn the credit of a finish. Cuts and corner stoppages are real finishes.
    """
    kind = classify_method(method)
    return kind in (MethodKind.KO_TKO, MethodKind.SUBMISSION) and bool(
        method_detail and _INJURY.search(method_detail)
    )


@dataclass(frozen=True)
class ScoringInput:
    """Everything the scorer needs, independent of where it was loaded from."""

    scheduled_rounds: int | None
    method: str
    end_round: int
    end_time_seconds: int
    rounds: Sequence[ParsedRound]
    #: Pre-fight facts about the bout's place on the card (None = not known to the caller).
    card_position: int | None = None
    is_title_fight: bool = False
    #: What was known about the two fighters before the bout (None = not available).
    context: CareerContext | None = None
    #: The source's detail of how it ended (e.g. "to Knee Injury"); None = not known.
    method_detail: str | None = None
    #: The year of the event (pre-fight fact); None = not known.
    event_year: int | None = None

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
            card_position=fight.card_position,
            is_title_fight=fight.is_title_fight,
            method_detail=fight.result.method_detail,
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
    real_finish = finished and not is_injury_stoppage(inp.method, inp.method_detail)
    cut_short = (finished and not real_finish) or (
        kind is MethodKind.NO_RESULT and inp.method.strip().upper().startswith("COULD NOT")
    )
    career = _career_features(inp.context)
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
        "main_event": 1.0 if inp.card_position == 1 else 0.0,
        "co_main": 1.0 if inp.card_position == 2 else 0.0,
        "title_fight": 1.0 if inp.is_title_fight else 0.0,
        "volume": float(total_sig),
        "five_rounds": 1.0 if inp.scheduled_rounds == 5 else 0.0,
        "event_year": float(inp.event_year or 0),
        "cut_short": (1.0 - time_fraction) if cut_short else 0.0,
        "real_finish": 1.0 if real_finish else 0.0,
        "real_early_finish": 1.0 - time_fraction if real_finish else 0.0,
        "expected_finish": career["finish_prone"] if real_finish else 0.0,
        "expected_ko": career["ko_prone"] if real_finish and kind is MethodKind.KO_TKO else 0.0,
        "fragile_ko": (
            max(0.0, career["ko_prone"] - KO_PRONE_USUAL)
            if real_finish and kind is MethodKind.KO_TKO
            else 0.0
        ),
        **{name: value for name, value in career.items() if name in _CAREER_FEATURE_NAMES},
    }


_CAREER_FEATURE_NAMES = ("rematch", "streak", "star_power", "unbeaten_fighter", "experience")


def _career_features(context: CareerContext | None) -> dict[str, float]:
    """The career features plus `finish_prone` / `ko_prone`, which only feed the interactions."""
    if context is None:
        return {
            "rematch": 0.0,
            "streak": 0.0,
            "star_power": 0.0,
            "unbeaten_fighter": 0.0,
            "experience": 0.0,
            "finish_prone": 0.0,
            "ko_prone": 0.0,
        }
    return {
        "finish_prone": context.finish_prone,
        "ko_prone": context.ko_prone,
        "rematch": 1.0 if context.prior_meetings > 0 else 0.0,
        "streak": float(sum(context.win_streaks)),
        "star_power": float(sum(context.prior_headliners)),
        "unbeaten_fighter": 1.0 if any(context.unbeaten) else 0.0,
        "experience": float(min(context.prior_fights)),
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
