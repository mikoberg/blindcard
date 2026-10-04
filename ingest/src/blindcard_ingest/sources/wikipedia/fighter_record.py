"""A fighter's professional MMA record as it stood BEFORE a given bout, from their Wikipedia page.

A fighter's page ends in a table of every bout: result, the record AFTER that bout, opponent,
method, event, date. The page's headline record is the current one (after every bout), which
would give away the result of any bout shown from the past, so it is never used. The record
before a bout is the record column of the bout just before it. Nothing about the bout itself
(its result or method) is read out of the row, only its date, opponent and the record column of
the row before.

Never guess: a bout is found only when exactly one row matches both the event date and the
opponent; otherwise there is no record.
"""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass

from blindcard_ingest.bonus_matching import EventIndex, FightNames
from blindcard_ingest.sources.wikipedia.markup import clean_wikitext

_MONTHS = {
    name: index
    for index, name in enumerate(
        [
            "january",
            "february",
            "march",
            "april",
            "may",
            "june",
            "july",
            "august",
            "september",
            "october",
            "november",
            "december",
        ],
        start=1,
    )
}
_DASH = r"[–—\-]"


@dataclass(frozen=True)
class Record:
    wins: int
    losses: int
    draws: int
    no_contests: int


@dataclass(frozen=True)
class RecordRow:
    """One bout of the table. `after` is the record AFTER it; the bout's result is not kept."""

    date: dt.date
    opponent: str
    after: Record


DEBUT = Record(0, 0, 0, 0)


def _split_top_level(text: str) -> list[str]:
    """Split on `|` outside nested `[[...]]` and `{{...}}`."""
    parts: list[str] = []
    depth = 0
    current: list[str] = []
    i = 0
    while i < len(text):
        pair = text[i : i + 2]
        if pair in ("[[", "{{"):
            depth += 1
            current.append(pair)
            i += 2
        elif pair in ("]]", "}}"):
            depth = max(0, depth - 1)
            current.append(pair)
            i += 2
        elif text[i] == "|" and depth == 0:
            parts.append("".join(current))
            current = []
            i += 1
        else:
            current.append(text[i])
            i += 1
    parts.append("".join(current))
    return parts


def parse_record(text: str) -> Record | None:
    """ "18-5", "17-4-1", "16-4 (1 NC)", "15-3, 1 NC" -> Record; None if it is not a record."""
    cleaned = clean_wikitext(text)
    match = re.match(rf"\s*(\d+)\s*{_DASH}\s*(\d+)(?:\s*{_DASH}\s*(\d+))?", cleaned)
    if not match:
        return None
    rest = cleaned[match.end() :]
    nc_match = re.search(r"\((\d+)\s*(?:NC)?\)|(\d+)\s*NC", rest, re.I)
    no_contests = int(next(g for g in nc_match.groups() if g)) if nc_match else 0
    return Record(
        wins=int(match.group(1)),
        losses=int(match.group(2)),
        draws=int(match.group(3) or 0),
        no_contests=no_contests,
    )


def parse_date(text: str) -> dt.date | None:
    """`{{dts|2019|June|1|format=dmy}}`, `{{dts|format=dmy|2019|06|01}}`, "June 1, 2019"."""
    template = re.search(r"\{\{\s*dts\s*\|([^{}]*)\}\}", text, re.I)
    if template:
        args = [a.strip() for a in template.group(1).split("|") if "=" not in a and a.strip()]
        if len(args) >= 3:
            return _date(args[0], args[1], args[2])
        if len(args) == 1:
            return parse_date(args[0])
        return None
    plain = clean_wikitext(text)
    match = re.search(r"([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})", plain)
    if match:
        return _date(match.group(3), match.group(1), match.group(2))
    match = re.search(r"(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})", plain)
    if match:
        return _date(match.group(3), match.group(2), match.group(1))
    return None


def _date(year: str, month: str, day: str) -> dt.date | None:
    try:
        month_number = int(month) if month.isdigit() else _MONTHS[month.lower()]
        return dt.date(int(year), month_number, int(day))
    except (KeyError, ValueError):
        return None


def _clean_cell(raw: str) -> str:
    parts = _split_top_level(raw)
    return parts[-1].strip() if len(parts) > 1 else raw.strip()


def _headings(wikitext: str) -> list[tuple[int, str]]:
    return [
        (m.start(), m.group(1).strip().lower())
        for m in re.finditer(r"(?m)^=+\s*([^=\n]+?)\s*=+\s*$", wikitext)
    ]


#: The columns of the `{{MMA record start}}` template, which writes its own header row.
_TEMPLATE_COLUMNS = {
    "res": 0,
    "record": 1,
    "opponent": 2,
    "method": 3,
    "event": 4,
    "date": 5,
    "round": 6,
    "time": 7,
    "location": 8,
    "notes": 9,
}
_TEMPLATE_BLOCK = re.compile(
    r"\{\{\s*MMA record start[^}]*\}\}(.*?)\n(?:\{\{\s*end\s*\}\}|\|\})", re.S | re.I
)


def _blocks(wikitext: str) -> list[tuple[int, str, dict[str, int] | None]]:
    """Record tables: (position, text, columns). Columns are None when the table has a header
    row of its own, and fixed when it is a `{{MMA record start}}` ... `{{end}}` block."""
    found: list[tuple[int, str, dict[str, int] | None]] = []
    for table in re.finditer(r"\{\|.*?\n\|\}", wikitext, re.S):
        found.append((table.start(), table.group(0), None))
    for block in _TEMPLATE_BLOCK.finditer(wikitext):
        found.append((block.start(), "\n" + block.group(1) + "\n", _TEMPLATE_COLUMNS))
    return sorted(found, key=lambda item: item[0])


def parse_record_rows(wikitext: str) -> list[RecordRow]:
    """The bouts of the page's professional MMA record, in the order of the page.

    Other tables with the same columns (freestyle wrestling, boxing, amateur or exhibition MMA)
    are skipped: it needs an MMA heading above it, and a hand-made table needs a Method column.
    """
    headings = _headings(wikitext)
    rows: list[RecordRow] = []
    for position, text, columns in _blocks(wikitext):
        heading = ""
        for start, name in headings:
            if start < position:
                heading = name
        if not re.search(r"mixed martial arts|\bmma\b|professional", heading):
            continue
        if re.search(r"amateur|exhibition", heading):
            continue
        parsed = _parse_table(text, columns)
        if parsed:
            rows.extend(parsed)
            break  # the first matching table is the professional record
    return rows


def _parse_table(table: str, preset: dict[str, int] | None = None) -> list[RecordRow] | None:
    chunks = re.split(r"\n\|-[^\n]*\n", table)
    columns: dict[str, int] | None = preset
    result: list[RecordRow] = []
    for chunk in chunks:
        lines = chunk.strip().splitlines()
        header_cells = [
            re.sub(r"^!\s*(?:[^|]*\|)?\s*", "", line).strip().lower()
            for line in lines
            if line.lstrip().startswith("!")
        ]
        if header_cells and columns is None:
            names = [clean_wikitext(c).lower().rstrip(".") for c in header_cells]
            if "method" in names and "opponent" in names and "record" in names:
                columns = {name: index for index, name in enumerate(names)}
            continue
        if columns is None or any(line.lstrip().startswith("!") for line in lines):
            continue
        cells: list[str] = []
        for line in lines:
            if not line.lstrip().startswith("|"):
                continue
            body = line.lstrip()[1:]
            cells.extend(_clean_cell(cell) for cell in _split_double_bar(body))
        row = _row(cells, columns)
        if row is not None:
            result.append(row)
    return result if columns is not None else None


def _split_double_bar(text: str) -> list[str]:
    """`a || b || c` on one line is three cells (outside links and templates)."""
    parts: list[str] = []
    depth = 0
    current: list[str] = []
    i = 0
    while i < len(text):
        pair = text[i : i + 2]
        if pair in ("[[", "{{"):
            depth += 1
            current.append(pair)
            i += 2
        elif pair in ("]]", "}}"):
            depth = max(0, depth - 1)
            current.append(pair)
            i += 2
        elif pair == "||" and depth == 0:
            parts.append("".join(current))
            current = []
            i += 2
        else:
            current.append(text[i])
            i += 1
    parts.append("".join(current))
    return parts


def _row(cells: list[str], columns: dict[str, int]) -> RecordRow | None:
    try:
        record = parse_record(cells[columns["record"]])
        opponent = clean_wikitext(cells[columns["opponent"]])
        date = parse_date(cells[columns["date"]])
    except (IndexError, KeyError):
        return None
    if record is None or date is None or opponent == "":
        return None
    return RecordRow(date=date, opponent=opponent, after=record)


def record_before(
    rows: list[RecordRow], event_date: dt.date, opponent: str, *, tolerance_days: int = 1
) -> Record | None:
    """The fighter's record before the bout on `event_date` against `opponent`.

    None unless exactly one row matches the date and the opponent. The record is that of the
    latest row dated strictly before the bout (a debut has 0-0-0); the matching row is not read
    beyond its date and opponent.
    """
    index = EventIndex([FightNames("opponent", (opponent, "Nobody Nowhere"))])
    matches = [
        row
        for row in rows
        if abs((row.date - event_date).days) <= tolerance_days
        and index.resolve(row.opponent) == "opponent"
    ]
    if len(matches) != 1:
        return None
    bout_date = matches[0].date
    earlier = [row for row in rows if row.date < bout_date]
    if not earlier:
        return DEBUT
    return max(earlier, key=lambda row: row.date).after
