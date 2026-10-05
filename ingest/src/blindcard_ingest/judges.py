"""Judge statistics: how often a judge scores against the final result, and how wide they score.

Scorecards are stored as text, e.g. "Ron McCarthy 29 - 28". In the source the FIRST number is the
fighter who lost the decision and the SECOND the one who won it, so a card's margin (second minus
first) is positive when the judge agreed with the result and negative when they did not.

Only aggregates leave this module: per judge a few counts and sums, plus the totals of all judges.
No fight, event or fighter is part of them. Draws are left out (there is no winner to agree with).
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter, defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field

CARD = re.compile(r"^(.*?)\s+(\d+)\s*-\s*(\d+)$")
#: Notes the source glues to a name: "Point Deducted: Low Blows by ZhangEric Colon".
NOTE_PREFIXES = ("Point Deducted", "Technical Decision", "Technical")
NAME_TAIL = re.compile(r"([A-Z][a-z'’.-]+(?: [A-Z][A-Za-z'’.-]+)+)$")
#: Judges with fewer cards than this get no verdict on the site (too little to say anything).
MIN_CARDS = 30


@dataclass(frozen=True)
class JudgeCard:
    name: str
    #: second - first: positive = agreed with the result, negative = scored the loser ahead.
    margin: int


def clean_name(raw: str) -> str | None:
    name = raw.strip()
    if name.startswith(NOTE_PREFIXES):
        match = NAME_TAIL.search(name)
        return match.group(1) if match else None
    return name or None


def parse_card(text: str) -> JudgeCard | None:
    match = CARD.match(text.strip())
    if not match:
        return None
    name = clean_name(match.group(1))
    if name is None:
        return None
    return JudgeCard(name=name, margin=int(match.group(3)) - int(match.group(2)))


def _ascii(text: str) -> str:
    return unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode()


def slugify(name: str) -> str:
    """ "Sal D'amato" -> "sal-damato". The web app builds the same slug for its links."""
    plain = _ascii(name).lower().replace("'", "").replace("’", "")
    return re.sub(r"[^a-z0-9]+", "-", plain).strip("-")


def name_key(name: str) -> str:
    """Same person, whichever order the name was written in: lower-case words, sorted."""
    return " ".join(sorted(re.findall(r"[a-z0-9]+", _ascii(name).lower().replace("'", ""))))


#: A name seen on at least this many cards is trusted as a real name.
KNOWN_NAME_CARDS = 10


def resolve_glued(names: Counter[str]) -> dict[str, str]:
    """Map a name with something glued in front ("Eye PokeEric Colon") to the real name it ends in.

    A frequent name is trusted; a rarer one that ends in it, right after a lower-case letter, is
    that name with a note stuck on.
    """
    known = [n for n, count in names.items() if count >= KNOWN_NAME_CARDS]
    resolved: dict[str, str] = {}
    for name in names:
        resolved[name] = name
        if names[name] >= KNOWN_NAME_CARDS:
            continue
        for real in sorted(known, key=len, reverse=True):
            if name.endswith(real) and len(name) > len(real) and name[-len(real) - 1].islower():
                resolved[name] = real
                break
    return resolved


@dataclass
class JudgeStats:
    slug: str
    name: str
    slugs: list[str]
    cards: int = 0
    dissent: int = 0  # scored the fighter who lost ahead
    lone_dissent: int = 0  # ... while both colleagues agreed with the result
    abs_sum: int = 0  # sum of |margin|
    abs_sumsq: int = 0
    first_year: int = 0
    last_year: int = 0


@dataclass
class Baseline:
    cards: int = 0
    dissent: int = 0
    abs_sum: int = 0
    abs_sumsq: int = 0
    judges_with_enough: int = 0


@dataclass
class JudgeReport:
    judges: list[JudgeStats] = field(default_factory=list)
    baseline: Baseline = field(default_factory=Baseline)
    decisions: int = 0
    skipped: int = 0


def compute_judge_stats(decisions: Iterable[tuple[int, Sequence[str]]]) -> JudgeReport:
    """`decisions`: (event year, the three scorecard texts) of decisions with a winner."""
    forms: dict[str, Counter[str]] = defaultdict(Counter)
    parsed_rows: list[tuple[int, list[JudgeCard]]] = []
    report = JudgeReport()
    for year, texts in decisions:
        cards = [parse_card(t) for t in texts]
        if len(cards) != 3 or any(c is None for c in cards):
            report.skipped += 1
            continue
        parsed_rows.append((year, [c for c in cards if c is not None]))
        report.decisions += 1
    resolved = resolve_glued(Counter(c.name for _, cards in parsed_rows for c in cards))
    rows: list[tuple[int, list[tuple[str, int]]]] = []
    for year, parsed in parsed_rows:
        keys = []
        for c in parsed:
            name = resolved[c.name]
            keys.append((name_key(name), c.margin))
            forms[name_key(name)][name] += 1
        rows.append((year, keys))

    stats: dict[str, JudgeStats] = {}
    for key, counter in forms.items():
        name = counter.most_common(1)[0][0]
        stats[key] = JudgeStats(
            slug=slugify(name),
            name=name,
            slugs=sorted({slugify(n) for n in counter}),
        )
    for year, keys in rows:
        for index, (key, margin) in enumerate(keys):
            others = [m for i, (_, m) in enumerate(keys) if i != index]
            j = stats[key]
            j.cards += 1
            j.dissent += margin < 0
            j.lone_dissent += margin < 0 and all(m > 0 for m in others)
            j.abs_sum += abs(margin)
            j.abs_sumsq += margin * margin
            j.first_year = year if not j.first_year else min(j.first_year, year)
            j.last_year = max(j.last_year, year)
    base = report.baseline
    for j in stats.values():
        base.cards += j.cards
        base.dissent += j.dissent
        base.abs_sum += j.abs_sum
        base.abs_sumsq += j.abs_sumsq
        base.judges_with_enough += j.cards >= MIN_CARDS
    # A small count says too much about one bout: judges below the minimum are stored by name
    # only (all numbers zero), so the site can link them but shows nothing about them. The totals
    # of all judges above were taken before this.
    for j in stats.values():
        if j.cards < MIN_CARDS:
            j.cards = j.dissent = j.lone_dissent = j.abs_sum = j.abs_sumsq = 0
            j.first_year = j.last_year = 0
    report.judges = sorted(stats.values(), key=lambda j: (-j.cards, j.slug))
    return report
