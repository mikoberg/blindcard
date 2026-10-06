"""The UFC divisional rankings, from the Wikipedia article "UFC rankings".

The article holds the CURRENT rankings of every division (champion, then 1 to 15). Its page history
holds the rankings of every earlier week, so the ranking a fighter had before an event is the latest
revision of the article from before the event date. The layout of the tables changed a few times
(2018, 2021, 2024 and now); this parser reads all four.

What it returns is public, pre-fight context: who stood where. Never a result.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

#: The divisions as the fights store them. Order matters when a heading is matched.
DIVISIONS: tuple[str, ...] = (
    "Light Heavyweight",
    "Heavyweight",
    "Middleweight",
    "Welterweight",
    "Lightweight",
    "Featherweight",
    "Bantamweight",
    "Flyweight",
    "Strawweight",
)

#: A revision that lists fewer fighters than this was not read (a layout this parser does not know,
#: or a page being edited): the real article lists about 170.
MIN_LISTED = 100

#: 0 stands for the champion.
CHAMPION = 0
MAX_RANK = 15

_HEADING = re.compile(r"^(={2,4})\s*(.+?)\s*\1\s*$", re.M)
_CAPTION = re.compile(r"^\|\+[ \t]*(?:\{\{big\|)?([^}<\n]+)", re.M)
_LINK = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]*))?\]\]")
_DISAMBIGUATION = re.compile(r"\s*\((?:fighter|martial artist|mixed martial artist|boxer)\)$", re.I)
_REF = re.compile(r"<ref[^>]*?/>|<ref[^>]*?>.*?</ref>", re.S | re.I)


@dataclass(frozen=True)
class Ranked:
    division: str
    #: 0 = champion, otherwise 1 to 15.
    rank: int
    name: str


def division_of(text: str | None) -> str | None:
    """The division a heading or a stored weight class names, or None (pound-for-pound, catch
    weight, open weight). Women's divisions come back as "Women's Strawweight" and so on."""
    plain = _LINK.sub(lambda m: m.group(2) or m.group(1), text or "").strip().lower()
    if not plain or "pound" in plain or "catch" in plain or "open" in plain:
        return None
    for name in DIVISIONS:
        if name.lower() in plain:
            return f"Women's {name}" if "women" in plain else name
    return None


def normalise(name: str) -> str:
    """A name for comparing people: no accents, no punctuation, lower case, single spaces."""
    base = unicodedata.normalize("NFKD", name)
    base = "".join(ch for ch in base if not unicodedata.combining(ch))
    base = re.sub(r"[^a-z0-9 ]", " ", base.lower().replace("ø", "o").replace("đ", "d"))
    return " ".join(base.split())


def _name(markup: str) -> str | None:
    """The first person named in `markup`: the link text, without a disambiguation suffix."""
    match = _LINK.search(markup)
    if match is None:
        return None
    shown = (match.group(2) or match.group(1)).strip()
    return _DISAMBIGUATION.sub("", shown) or None


def _rank_of(first_line: str) -> int | None:
    """The rank in the first line of a table row, or None when it is not a ranked row.

    The cell is `! 3`, `|3`, `| align="center" |3` or a champion cell (`{{Tooltip|C|Champion}}`,
    sometimes with a style in front)."""
    line = first_line.strip()
    if re.search(r"Tooltip\|\s*C\s*\|", line) or re.fullmatch(r"[!|].*?\|?\s*C\s*", line):
        return CHAMPION
    match = re.fullmatch(r"[!|]\s*(?:[^|\n]*\|)?\s*(\d{1,2})\s*", line)
    if match and 1 <= int(match.group(1)) <= MAX_RANK:
        return int(match.group(1))
    return None


def _sections(wikitext: str) -> list[tuple[str, str]]:
    """(division, body) of the first section of each division, in page order. A division starts at
    its heading or, in the 2019 layout, at the caption of its table (`|+{{big|Heavyweight}}`). The
    page repeats the divisions (a second ranking system further down): the first one is the one in
    use."""
    markers: list[tuple[int, int, str | None]] = [
        (m.start(), m.end(), division_of(m.group(2))) for m in _HEADING.finditer(wikitext)
    ]
    # A caption only marks a division when it names one: any other caption is part of a table.
    for caption in _CAPTION.finditer(wikitext):
        named = division_of(caption.group(1))
        if named is not None:
            markers.append((caption.start(), caption.end(), named))
    markers.sort()
    seen: set[str] = set()
    found: list[tuple[str, str]] = []
    for index, (_, after, division) in enumerate(markers):
        if division is None or division in seen:
            continue
        end = markers[index + 1][0] if index + 1 < len(markers) else len(wikitext)
        body = wikitext[after:end]
        if "wikitable" not in body and "Champion" not in body and "\n|-" not in body:
            continue  # a heading that names a division but holds no ranking
        seen.add(division)
        found.append((division, body))
    return found


def parse_rankings(wikitext: str) -> list[Ranked]:
    """Every ranked fighter of every division on the page, champions as rank 0."""
    text = _REF.sub("", wikitext)
    ranked: list[Ranked] = []
    for division, body in _sections(text):
        # Older layouts name the champion in a line above the table.
        champion = re.search(r"^'*\s*Champion\s*:?'*[^\n]*$", body, re.M | re.I)
        if champion is not None and "Interim" not in champion.group(0):
            name = _name(champion.group(0))
            if name:
                ranked.append(Ranked(division, CHAMPION, name))
        for chunk in re.split(r"\n\|-[^\n]*\n", body):
            lines = [line for line in chunk.strip().splitlines() if line.strip()]
            if not lines:
                continue
            rank = _rank_of(lines[0])
            if rank is None:
                continue
            name = _name("\n".join(lines[1:]) if len(lines) > 1 else lines[0])
            if name:
                ranked.append(Ranked(division, rank, name))
    return _without_repeats(ranked)


def _without_repeats(ranked: list[Ranked]) -> list[Ranked]:
    """One place per fighter per division, the first one found (a champion is also a table row in
    the newer layouts)."""
    seen: set[tuple[str, str]] = set()
    unique: list[Ranked] = []
    for item in ranked:
        key = (item.division, normalise(item.name))
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def rank_lookup(ranked: list[Ranked]) -> dict[tuple[str, str], int]:
    """(division, normalised name) -> rank, for matching a fight's fighters."""
    return {(r.division, normalise(r.name)): r.rank for r in ranked}
