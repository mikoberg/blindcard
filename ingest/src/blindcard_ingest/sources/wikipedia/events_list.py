"""Parse the "List of UFC events" article into (page title, display name, date) rows."""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass

_MONTHS = {
    name: number
    for number, name in enumerate(
        ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), 1
    )
}
_LINK = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]")
_DATE = re.compile(r"\{\{dts\|\s*(\d{4})\s*\|\s*([A-Za-z]+)\s*\|\s*(\d{1,2})")


@dataclass(frozen=True)
class WikiEvent:
    title: str  # the article title, for the API
    display: str  # the text shown in the list, e.g. "UFC 331: Van vs. Pantoja 2"
    date: dt.date


def parse_events_list(wikitext: str) -> list[WikiEvent]:
    """One entry per table row that has an event link and a `{{dts|YYYY|Mon|D}}` date."""
    events: list[WikiEvent] = []
    for row in re.split(r"\n\|-", wikitext):
        link = _LINK.search(row)
        date_match = _DATE.search(row)
        if link is None or date_match is None:
            continue
        title = link.group(1).strip()
        if not title.startswith("UFC"):
            continue
        month = _MONTHS.get(date_match.group(2)[:3].lower())
        if month is None:
            continue
        try:
            date = dt.date(int(date_match.group(1)), month, int(date_match.group(3)))
        except ValueError:
            continue
        events.append(WikiEvent(title=title, display=(link.group(2) or title).strip(), date=date))
    return events
