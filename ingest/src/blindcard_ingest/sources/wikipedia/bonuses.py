"""Parse the "Bonus awards" section of a UFC event article.

Only Fight of the Night and Performance of the Night count. Special one-off bonuses and prose
(for example about a rescinded award) are ignored, because only lines that START with the
award label are read. Whatever cannot be read is simply not there: callers must never treat a
missing award as "no bonus" (see `BonusAwards.is_labeled`).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from blindcard_ingest.sources.wikipedia.markup import clean_wikitext

FIGHT_OF_THE_NIGHT = "fight_of_the_night"
PERFORMANCE_OF_THE_NIGHT = "performance_of_the_night"

_SECTION = re.compile(
    r"(?:^|\n)==\s*(?:Bonus awards?|Fight bonuses|Bonuses)\s*==\s*\n(.*?)(?=\n==[^=]|\Z)",
    re.S | re.I,
)
_AWARD_LINE = re.compile(
    r"^[*\s]*(?P<kind>Fights?|Performances?) of the Night\b[^:]*:\s*(?P<body>.*)$", re.I
)
_NONE = re.compile(r"^(?:none|not awarded|no (?:bonus|award)|n/?a)\b", re.I)
_NOTE = re.compile(r"\([^)]*\)")
_PAIR_SPLIT = re.compile(r"\s+and\s+(?=.+?\s+vs\.?\s+)")
_VS = re.compile(r"\s+vs\.?\s+", re.I)
_NAME_SPLIT = re.compile(r"\s*(?:,|;|&|\band\b)\s*")


@dataclass(frozen=True)
class BonusAwards:
    #: Each entry holds the fighters named for one Fight of the Night (usually two).
    fights_of_the_night: tuple[tuple[str, ...], ...]
    performers_of_the_night: tuple[str, ...]
    #: A Fight of the Night / Performance of the Night line existed (even "none awarded").
    fotn_stated: bool
    potn_stated: bool

    @property
    def is_labeled(self) -> bool:
        """True only when at least one award is actually named.

        An event with no named award is excluded from fitting and evaluation: a missing label
        is not a negative label.
        """
        return bool(self.fights_of_the_night or self.performers_of_the_night)


_ABBREVIATION_END = re.compile(r"(?:\b(?:Jr|Sr|St|Dr)|\b[A-Z])\.$")


def _strip_sentence_period(text: str) -> str:
    """Drop a sentence-final period, but keep the one of "Jr." or an initial such as "T.J."."""
    text = text.strip()
    if text.endswith(".") and not _ABBREVIATION_END.search(text):
        text = text[:-1].rstrip()
    return text


def _names(body: str) -> list[str]:
    return [n for n in (part.strip() for part in _NAME_SPLIT.split(body)) if n]


def parse_bonus_awards(wikitext: str) -> BonusAwards | None:
    """Return the awards of the "Bonus awards" section, or None when the page has none."""
    match = _SECTION.search(wikitext)
    if match is None:
        return None

    fights: list[tuple[str, ...]] = []
    performers: list[str] = []
    fotn_stated = potn_stated = False
    for raw in match.group(1).split("\n"):
        line = _AWARD_LINE.match(clean_wikitext(raw))
        if line is None:
            continue
        is_fight = line.group("kind").lower().startswith("fight")
        body = _strip_sentence_period(_NOTE.sub("", line.group("body")))
        if is_fight:
            fotn_stated = True
        else:
            potn_stated = True
        if not body or _NONE.match(body):
            continue
        if is_fight:
            for part in _PAIR_SPLIT.split(body):
                group = tuple(_strip_sentence_period(n) for n in _VS.split(part) if n.strip())
                if not group:
                    continue
                if len(group) == 1:  # "A, B" without "vs": the names of one fight
                    group = tuple(_names(group[0]))
                if group:
                    fights.append(group)
        else:
            performers.extend(n for n in _names(body) if not _NONE.match(n))

    return BonusAwards(
        fights_of_the_night=tuple(fights),
        performers_of_the_night=tuple(performers),
        fotn_stated=fotn_stated,
        potn_stated=potn_stated,
    )
