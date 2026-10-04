"""Which part of the card each bout was on, read from a Wikipedia event article.

The Results section is a run of `{{MMAevent card|Main Card}}` headers, each followed by
`{{MMAevent bout|weight|fighter|def.|fighter|method|round|time|notes}}` templates.

That text contains RESULTS (the winner is listed first, the method and time follow). This
parser keeps none of it: a bout comes back as an UNORDERED pair of names under its segment
header, nothing else.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from blindcard_ingest.sources.wikipedia.markup import clean_wikitext

MAIN = "main"
PRELIM = "prelim"
EARLY_PRELIM = "early_prelim"

_HEADERS = {
    "main card": MAIN,
    "preliminary card": PRELIM,
    "early preliminary card": EARLY_PRELIM,
}
_CHAMPION_MARK = re.compile(r"\s*\((?:c|ic|rt)\)\s*$", re.I)


@dataclass(frozen=True)
class CardBout:
    #: main / prelim / early_prelim, or None for a header we do not map (e.g. a plain "Fight
    #: card": a single-part card has no segments to show).
    segment: str | None
    #: The two fighters, sorted: the order in the source follows the result, so it is dropped.
    names: tuple[str, str]


def _template_end(text: str, start: int) -> int:
    """Index just past the `}}` that closes the `{{` at `start`, or -1."""
    depth = 0
    i = start
    while i < len(text) - 1:
        pair = text[i : i + 2]
        if pair == "{{":
            depth += 1
            i += 2
        elif pair == "}}":
            depth -= 1
            i += 2
            if depth == 0:
                return i
        else:
            i += 1
    return -1


def _split_params(body: str) -> list[str]:
    """Split a template body on `|`, except inside nested `[[...]]` and `{{...}}`."""
    parts: list[str] = []
    depth = 0
    current: list[str] = []
    i = 0
    while i < len(body):
        pair = body[i : i + 2]
        if pair in ("[[", "{{"):
            depth += 1
            current.append(pair)
            i += 2
        elif pair in ("]]", "}}"):
            depth = max(0, depth - 1)
            current.append(pair)
            i += 2
        elif body[i] == "|" and depth == 0:
            parts.append("".join(current))
            current = []
            i += 1
        else:
            current.append(body[i])
            i += 1
    parts.append("".join(current))
    return parts


def _name(raw: str) -> str:
    return _CHAMPION_MARK.sub("", clean_wikitext(raw)).strip()


def _segment_of(header: str) -> str | None:
    key = re.sub(r"\(.*", "", clean_wikitext(header)).strip().lower()
    return _HEADERS.get(key)


def parse_card(wikitext: str) -> tuple[CardBout, ...] | None:
    """Every bout of the article with its segment, in the order of the article.

    None when the article has no bout templates at all.
    """
    bouts: list[CardBout] = []
    segment: str | None = None
    for match in re.finditer(r"\{\{\s*MMAevent\s+(card|bout)\b", wikitext, re.I):
        end = _template_end(wikitext, match.start())
        if end < 0:
            continue
        params = _split_params(wikitext[match.start() + 2 : end - 2])
        kind = match.group(1).lower()
        if kind == "card":
            segment = _segment_of(params[1]) if len(params) > 1 else None
            continue
        # params: [template name, weight class, fighter, "def."/"vs.", fighter, method, ...]
        if len(params) < 5:
            continue
        first, second = _name(params[2]), _name(params[4])
        if first and second:
            bouts.append(CardBout(segment=segment, names=(min(first, second), max(first, second))))
    return tuple(bouts) if bouts else None
