"""Match fights to the official full-fight videos of a channel, by title.

A title is only ever used to decide WHICH video belongs to a fight. It is not stored: it usually
says how the fight ended. Never guess: a fight gets a video only when exactly one candidate
fits, and rematches need the event number to tell the videos apart.
"""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from blindcard_ingest.sources.youtube import Video

SUFFIXES = {"jr", "sr", "ii", "iii", "iv"}
#: Videos that are not the fight itself.
NEGATIVE = (
    "highlight",
    "knockouts",
    "finishes",
    "compilation",
    "preview",
    "weigh",
    "press conference",
    "countdown",
    "embedded",
    "reaction",
    "best of",
    "every ",
    "top 10",
    "top 5",
    "all the",
    "breakdown",
    "promo",
    "face off",
    "faceoff",
    "staredown",
    "interview",
    "in the cage",
    "locker room",
)
POSITIVE = ("full fight", "free fight", "fight replay", "full bout")
NUMBER = re.compile(r"\bufc\s+(\d{1,3})\b")


def words(text: str) -> list[str]:
    plain = unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode().lower()
    return re.findall(r"[a-z0-9]+", plain.replace("'", "").replace(".", ""))


def _name_in(name: str, title_words: set[str]) -> bool:
    tokens = [w for w in words(name) if w not in SUFFIXES]
    if not tokens:
        return False
    if all(t in title_words for t in tokens):
        return True
    surname = tokens[-1]
    return len(tokens) > 1 and len(surname) >= 5 and surname in title_words


def event_number(text: str) -> str | None:
    match = NUMBER.search(" ".join(words(text)))
    return match.group(1) if match else None


@dataclass(frozen=True)
class FightToMatch:
    fight_id: str
    fighter_a: str
    fighter_b: str
    event_name: str


@dataclass(frozen=True)
class MatchResult:
    matched: dict[str, str]  # fight_id -> video id
    ambiguous: list[str]  # fight ids with several equally good videos, or undecidable rematches
    missing: list[str]  # fight ids without any video


def _score(video: Video, fight: FightToMatch) -> int | None:
    """None = not this fight's video. Higher is a better fit."""
    title = video.title.lower()
    tw = set(words(video.title))
    if not (_name_in(fight.fighter_a, tw) and _name_in(fight.fighter_b, tw)):
        return None
    if any(bad in title for bad in NEGATIVE):
        return None
    mine, theirs = event_number(fight.event_name), event_number(video.title)
    if mine and theirs and mine != theirs:
        return None
    score = 1
    if any(good in title for good in POSITIVE):
        score += 2
    if mine and theirs and mine == theirs:
        score += 3
    return score


def _pair(fight: FightToMatch) -> frozenset[str]:
    return frozenset((" ".join(words(fight.fighter_a)), " ".join(words(fight.fighter_b))))


def match_fights(fights: Sequence[FightToMatch], videos: Iterable[Video]) -> MatchResult:
    """One video per fight, or none. `videos` should all come from the one channel."""
    pool = list(videos)
    pair_counts: dict[frozenset[str], int] = defaultdict(int)
    for fight in fights:
        pair_counts[_pair(fight)] += 1

    matched: dict[str, str] = {}
    ambiguous: list[str] = []
    missing: list[str] = []
    for fight in fights:
        scored = [(s, v) for v in pool if (s := _score(v, fight)) is not None]
        rematch = pair_counts[_pair(fight)] > 1
        if rematch:
            if event_number(fight.event_name):
                # Several fights of the same two: only a video with the event number counts.
                scored = [(s, v) for s, v in scored if event_number(v.title)]
            else:
                scored = []  # cannot tell the fights apart: never guess
        if not scored:
            (ambiguous if rematch else missing).append(fight.fight_id)
            continue
        best = max(s for s, _ in scored)
        top = sorted((v for s, v in scored if s == best), key=lambda v: (v.published, v.video_id))
        if len({v.title.lower() for v in top}) > 1:
            ambiguous.append(fight.fight_id)
            continue
        matched[fight.fight_id] = top[0].video_id  # re-uploads of one title: the first upload
    return MatchResult(matched=matched, ambiguous=ambiguous, missing=missing)
