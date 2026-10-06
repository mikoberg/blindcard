"""A fighter's date of birth from the infobox of their Wikipedia article.

The infobox holds `| birth_date = {{Birth date and age|1990|2|13}}` (sometimes with `df=y` first or
a lower-case template name). Only that template is read: a date written any other way is left alone,
so nothing is guessed. A public fact about a public figure, shown on the fighter's page as an age.
"""

from __future__ import annotations

import datetime as dt
import re

_TEMPLATE = re.compile(
    r"birth_date\s*=\s*\{\{\s*(?:birth[ _]date(?:[ _]and[ _]age)?2?|bda)\s*\|([^{}]*)\}\}",
    re.IGNORECASE,
)

#: Nobody on a UFC card was born outside these years: a year beyond them is a parsing slip.
FIRST_YEAR = 1940
LAST_YEAR = 2012


def valid_birth_date(year: int, month: int, day: int) -> dt.date | None:
    if not FIRST_YEAR <= year <= LAST_YEAR:
        return None
    try:
        return dt.date(year, month, day)
    except ValueError:
        return None


def parse_birth_date(wikitext: str) -> dt.date | None:
    """The date of birth in the first infobox template of the article, or None."""
    match = _TEMPLATE.search(wikitext)
    if match is None:
        return None
    numbers = [part.strip() for part in match.group(1).split("|") if "=" not in part]
    if len(numbers) < 3 or not all(part.isdigit() for part in numbers[:3]):
        return None
    year, month, day = (int(part) for part in numbers[:3])
    return valid_birth_date(year, month, day)
