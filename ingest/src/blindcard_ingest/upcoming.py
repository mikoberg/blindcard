"""Upcoming events: the announced cards, read from Wikipedia before the event happens.

Only pre-fight facts are kept: the event, its date and place, and for each bout the two names,
the weight class, the part of the card and whether a title is at stake. A page is never read
again on or after the event's date: once the event has been fought the article fills with
results (winner listed first, method, time), and a card that already shows any of that is
refused outright.
"""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass

from blindcard_ingest.models import slugify
from blindcard_ingest.sources.wikipedia.card import (
    EARLY_PRELIM,
    MAIN,
    PRELIM,
    _split_params,
    _template_end,
)
from blindcard_ingest.sources.wikipedia.markup import clean_wikitext

#: Marks after a name: champion, interim champion (a title fight), "rt" and the like.
_TITLE_MARK = re.compile(r"\((?:c|ic)\)\s*$", re.I)
_OTHER_MARK = re.compile(r"\s*\((?:c|ic|rt)\)\s*$", re.I)
_TITLE_WORDS = re.compile(r"\b(?:championship|title)\b", re.I)
_PRELIM_WORDS = re.compile(r"^(early )?preliminary card$", re.I)


@dataclass(frozen=True)
class UpcomingBout:
    #: 1 = listed first, which is the main event.
    position: int
    segment: str | None
    weight_class: str | None
    #: Names in the order of the article before the event (the champion or higher-ranked first).
    a: str
    b: str
    is_title_fight: bool


@dataclass(frozen=True)
class UpcomingEvent:
    wiki_title: str
    name: str
    slug: str
    event_date: dt.date
    location: str | None
    bouts: tuple[UpcomingBout, ...]


@dataclass(frozen=True)
class UpcomingCard:
    bouts: tuple[UpcomingBout, ...]
    #: True when any bout already has a method, round, time or note: the event has been fought.
    has_results: bool


def _name(raw: str) -> str:
    return _OTHER_MARK.sub("", clean_wikitext(raw)).strip()


def _header_key(header: str) -> str:
    return re.sub(r"\(.*", "", clean_wikitext(header)).strip().lower()


def _segments(headers: list[str]) -> list[str | None]:
    """Segment per header, in order. "Fight card" on its own is the whole card (no split); in
    front of a "Preliminary card" it is the main card."""
    keys = [_header_key(h) for h in headers]
    has_prelim = any(_PRELIM_WORDS.match(k) for k in keys)
    result: list[str | None] = []
    for key in keys:
        if key == "main card":
            result.append(MAIN)
        elif key == "preliminary card":
            result.append(PRELIM)
        elif key == "early preliminary card":
            result.append(EARLY_PRELIM)
        elif key == "fight card" and has_prelim:
            result.append(MAIN)
        else:
            result.append(None)
    return result


def parse_upcoming_card(wikitext: str) -> UpcomingCard | None:
    """The announced bouts of one event article, in article order; None when there are none."""
    raw: list[tuple[int, list[str]]] = []  # (header index, params) per bout
    headers: list[str] = []
    for match in re.finditer(r"\{\{\s*MMAevent\s+(card|bout)\b", wikitext, re.I):
        end = _template_end(wikitext, match.start())
        if end < 0:
            continue
        params = _split_params(wikitext[match.start() + 2 : end - 2])
        if match.group(1).lower() == "card":
            headers.append(params[1] if len(params) > 1 else "")
            continue
        if len(params) >= 5:
            raw.append((len(headers) - 1, params))
    if not raw:
        return None
    segments = _segments(headers)
    bouts: list[UpcomingBout] = []
    has_results = False
    for index, (header_index, params) in enumerate(raw, 1):
        # params 5-7 are method, round and time; the 8th is a free note ("For the ... title").
        if any(clean_wikitext(p) for p in params[5:8]):
            has_results = True
        a, b = _name(params[2]), _name(params[4])
        if not a or not b:
            continue
        weight = clean_wikitext(params[1]) or None
        marked = bool(_TITLE_MARK.search(clean_wikitext(params[2]))) or bool(
            _TITLE_MARK.search(clean_wikitext(params[4]))
        )
        note = clean_wikitext(params[8]) if len(params) > 8 else ""
        title = marked or bool(weight and _TITLE_WORDS.search(weight))
        title = title or bool(_TITLE_WORDS.search(note))
        if weight:
            weight = _TITLE_WORDS.sub("", weight).strip() or None
        segment = segments[header_index] if 0 <= header_index < len(segments) else None
        bouts.append(
            UpcomingBout(
                position=index,
                segment=segment,
                weight_class=weight,
                a=a,
                b=b,
                is_title_fight=title,
            )
        )
    return UpcomingCard(bouts=tuple(bouts), has_results=has_results)


def _infobox_value(wikitext: str, key: str) -> str | None:
    match = re.search(rf"\|\s*{key}\s*=\s*([^\n]*)", wikitext, re.I)
    if match is None:
        return None
    value = clean_wikitext(match.group(1))
    return value or None


def parse_location(wikitext: str) -> str | None:
    """ "Meta Apex, Las Vegas" from the infobox, or None."""
    parts = [p for p in (_infobox_value(wikitext, "venue"), _infobox_value(wikitext, "city")) if p]
    return ", ".join(parts) if parts else None


def event_slug(name: str) -> str:
    return slugify(name)
