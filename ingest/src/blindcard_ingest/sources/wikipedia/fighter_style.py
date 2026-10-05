"""A fighter's fighting style, read from the infobox of their Wikipedia page.

Only the infobox fields `style` and `rank` are read, and only words from a fixed list come out of
them (so a stance, a belt colour or a hometown can never show up as a style). A page counts only
when it is an MMA fighter's page. Nothing about results is read.
"""

from __future__ import annotations

import re

from blindcard_ingest.sources.wikipedia.card import _split_params, _template_end
from blindcard_ingest.sources.wikipedia.markup import clean_wikitext

#: Display label and the words that mean it, in the order they are tried for each style word.
_LABELS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("Muay Thai", re.compile(r"muay\s*thai|thai\s*boxing", re.I)),
    ("Kickboxing", re.compile(r"kick\s*-?\s*box|\bk-1\b", re.I)),
    ("Boxing", re.compile(r"\bboxing\b", re.I)),
    ("Karate", re.compile(r"karate|kyokushin", re.I)),
    ("Taekwondo", re.compile(r"taekwondo|tae\s*kwon\s*do", re.I)),
    ("Sanda", re.compile(r"\bsanda\b|san\s*shou|sanshou", re.I)),
    ("Savate", re.compile(r"savate", re.I)),
    ("Lethwei", re.compile(r"lethwei", re.I)),
    ("Capoeira", re.compile(r"capoeira", re.I)),
    # before wrestling: "submission wrestling" is grappling
    ("Grappling", re.compile(r"grappling|submission", re.I)),
    ("Wrestling", re.compile(r"wrestling|\bcatch\b", re.I)),
    ("Brazilian jiu-jitsu", re.compile(r"jiu|\bbjj\b|jits", re.I)),
    ("Judo", re.compile(r"\bjudo\b", re.I)),
    ("Sambo", re.compile(r"sambo", re.I)),
    ("Luta Livre", re.compile(r"luta\s*livre", re.I)),
)
MAX_STYLES = 3
_SPLIT = re.compile(r"[,;/]|<br\s*/?>|\band\b|&", re.I)
_INFOBOX = re.compile(r"\{\{\s*Infobox\s+(?:martial artist|MMA\b)", re.I)


def is_mma_fighter_page(wikitext: str) -> bool:
    """A martial artist's infobox and mixed martial arts in the lead: the page of an MMA fighter."""
    return bool(_INFOBOX.search(wikitext)) and bool(
        re.search(r"mixed martial", wikitext[:6000], re.I)
    )


def _infobox_params(wikitext: str) -> dict[str, str]:
    match = _INFOBOX.search(wikitext)
    if match is None:
        return {}
    end = _template_end(wikitext, match.start())
    if end < 0:
        return {}
    params: dict[str, str] = {}
    for part in _split_params(wikitext[match.start() + 2 : end - 2])[1:]:
        key, sep, value = part.partition("=")
        if sep:
            params[key.strip().lower()] = value.strip()
    return params


def _from_rank(rank: str) -> list[str]:
    """Arts a fighter holds a rank in ("Black belt in Brazilian jiu-jitsu under ..."), in the order
    they are named. A belt is a fair sign of a background, so it fills in where `style` is empty."""
    text = clean_wikitext(rank)
    found: list[tuple[int, str]] = []
    for label, pattern in _LABELS:
        match = pattern.search(text)
        if match:
            found.append((match.start(), label))
    return [label for _, label in sorted(found)]


def parse_styles(wikitext: str) -> list[str]:
    """The labels of the infobox `style` field, in the order given, without repeats; the arts of
    the `rank` field follow when there is room."""
    params = _infobox_params(wikitext)
    labels: list[str] = []
    for word in _SPLIT.split(clean_wikitext(params.get("style", ""))):
        for label, pattern in _LABELS:
            if pattern.search(word):
                if label not in labels:
                    labels.append(label)
                break
    for label in _from_rank(params.get("rank", "")):
        if label not in labels:
            labels.append(label)
    return labels[:MAX_STYLES]
