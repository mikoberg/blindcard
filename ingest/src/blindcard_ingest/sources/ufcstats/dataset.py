"""Parse the ufcstats-derived CSV tables into the pipeline's models.

Input tables (one row per event / fight / fighter-round):
  * events:  EVENT, URL, DATE, LOCATION
  * results: EVENT, BOUT, OUTCOME, WEIGHTCLASS, METHOD, ROUND, TIME, TIME FORMAT, REFEREE,
             DETAILS, URL          (file order within an event = card order, main event first)
  * stats:   EVENT, BOUT, ROUND, FIGHTER, KD, SIG.STR., TOTAL STR., TD, SUB.ATT, REV., CTRL, ...

Never guess. Anything that cannot be attributed or parsed with certainty leaves that fight
without round data / result (so it stays incomplete and unscored), with a log line:
  * results and stats are joined only via event names present in the events table, so stale
    or renamed duplicate event names are dropped;
  * a (event, bout) pair that occurs more than once cannot be matched to stats rows;
  * a placeholder ("--") in any counted field means "not recorded", never zero;
  * fighters have no ids in this data, so they are keyed by normalised name.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import logging
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from pydantic import ValidationError

from blindcard_ingest.models import (
    EventBundle,
    Outcome,
    ParsedEvent,
    ParsedFight,
    ParsedFighter,
    ParsedResult,
    ParsedRound,
    order_fighters,
    slugify,
)

logger = logging.getLogger(__name__)

SOURCE_NAME = "ufcstats"
PROMOTION = "UFC"

#: Fighter ids never collide with the hex ids a direct ufcstats scrape would give.
FIGHTER_KEY_PREFIX = "name:"

_OUTCOMES: dict[str, tuple[Outcome, int | None]] = {
    # outcome -> (kind, index of the winner within "A vs. B")
    "W/L": ("win", 0),
    "L/W": ("win", 1),
    "D/D": ("draw", None),
    "NC/NC": ("no_contest", None),
}
# "3 Rnd (5-5-5)" or "3 Rnd + OT (5-5-5-5)": every round, overtime included, is 5 minutes.
_TIME_FORMAT_RE = re.compile(r"^(\d) Rnd( \+ OT)? \(((?:5-)*5)\)$")
_WEIGHT_CLASS_RE = re.compile(
    r"(Women's )?(Light Heavyweight|Heavyweight|Middleweight|Welterweight|Lightweight|"
    r"Featherweight|Bantamweight|Flyweight|Strawweight|Catch Weight|Open Weight)"
)
_SCORECARD_RE = re.compile(r"\s*(.+?\s\d+\s-\s\d+)\.")


class DatasetError(RuntimeError):
    """The dataset is structurally unusable for an event (not just one missing value)."""


def _safe_message(exc: Exception) -> str:
    """Describe an error for logs without echoing input values.

    Pydantic's default text includes the whole offending record (`input_value={...}`), which
    can contain result data. Logs may end up public (CI), so only field and reason are kept.
    """
    if isinstance(exc, ValidationError):
        return "; ".join(
            f"{'.'.join(str(part) for part in err['loc']) or 'record'}: {err['msg']}"
            for err in exc.errors(include_url=False, include_context=False, include_input=False)
        )
    return str(exc)


@dataclass(frozen=True)
class ParsedDataset:
    events: list[ParsedEvent]
    bundles: dict[str, EventBundle]
    event_errors: dict[str, str] = field(default_factory=dict)


# --- small field parsers (each raises ValueError on anything unexpected) ----------------------


def _count(value: str) -> int:
    text = value.strip()
    if re.fullmatch(r"\d+(\.0)?", text):
        return int(float(text))
    raise ValueError(f"not a count: {value!r}")


def _landed_of_attempted(value: str) -> tuple[int, int]:
    match = re.fullmatch(r"(\d+) of (\d+)", value.strip())
    if match is None:
        raise ValueError(f"not 'x of y': {value!r}")
    return int(match[1]), int(match[2])


def _minutes_seconds(value: str, *, what: str) -> int:
    match = re.fullmatch(r"(\d+):(\d{2})", value.strip())
    if match is None:
        raise ValueError(f"{what} not recorded or malformed: {value!r}")
    return int(match[1]) * 60 + int(match[2])


def fighter_key(name: str) -> str:
    return f"{FIGHTER_KEY_PREFIX}{slugify(name)}"


def source_id_from_url(url: str) -> str:
    tail = url.strip().rstrip("/").rsplit("/", 1)[-1]
    if not tail:
        raise ValueError(f"no id in url: {url!r}")
    return tail


def scheduled_rounds_from_format(time_format: str) -> int | None:
    """3 for "3 Rnd (5-5-5)" and for "3 Rnd + OT (5-5-5-5)". None for anything else (10/12/15/20
    minute rounds, "No Time Limit", ...), because the scoring features assume 300 s rounds."""
    match = _TIME_FORMAT_RE.match(time_format.strip())
    if match is None:
        return None
    rounds = int(match[1])
    expected_periods = rounds + (1 if match[2] else 0)
    return rounds if match[3].count("5") == expected_periods and 1 <= rounds <= 5 else None


def split_weight_class(raw: str) -> tuple[str | None, bool]:
    """("Light Heavyweight", True) for "UFC Light Heavyweight Title Bout".

    "UFC" is dropped from the weight class (it is a promotion name, not branding for us).
    Only UFC championship/interim bouts count as title fights; tournament finals do not.
    """
    text = raw.strip()
    is_title = (
        text.startswith("UFC ")
        and "Tournament" not in text
        and text.endswith(("Title Bout", "Championship Bout"))
    )
    match = _WEIGHT_CLASS_RE.search(text)
    return (match[0] if match else None), is_title


def parse_scorecards(method: str, details: str) -> list[str]:
    if not method.strip().startswith("Decision"):
        return []
    return [card.strip() for card in _SCORECARD_RE.findall(details)]


# --- tables ------------------------------------------------------------------------------------


def _rows(text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text)))


def parse_events(events_csv: str) -> list[ParsedEvent]:
    events: list[ParsedEvent] = []
    for row in _rows(events_csv):
        events.append(
            ParsedEvent(
                source_id=source_id_from_url(row["URL"]),
                name=row["EVENT"].strip(),
                event_date=dt.datetime.strptime(row["DATE"].strip(), "%B %d, %Y").date(),
                location=row["LOCATION"].strip() or None,
            )
        )
    return events


def parse_dataset(events_csv: str, results_csv: str, stats_csv: str) -> ParsedDataset:
    events = parse_events(events_csv)
    known_names = {e.name for e in events}

    results_by_event: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in _rows(results_csv):
        name = row["EVENT"].strip()
        if name in known_names:
            results_by_event[name].append(row)

    stats_by_bout: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for row in _rows(stats_csv):
        stats_by_bout[(row["EVENT"].strip(), row["BOUT"].strip())].append(row)

    bundles: dict[str, EventBundle] = {}
    errors: dict[str, str] = {}
    for event in events:
        try:
            bundles[event.source_id] = _build_bundle(
                event, results_by_event.get(event.name, []), stats_by_bout
            )
        except (DatasetError, ValueError, ValidationError) as exc:
            message = _safe_message(exc)
            logger.error("event %s (%s) unusable: %s", event.source_id, event.name, message)
            errors[event.source_id] = message
    return ParsedDataset(events=events, bundles=bundles, event_errors=errors)


def _build_bundle(
    event: ParsedEvent,
    result_rows: list[dict[str, str]],
    stats_by_bout: dict[tuple[str, str], list[dict[str, str]]],
) -> EventBundle:
    urls = Counter(row["URL"].strip() for row in result_rows)
    repeated = sorted(url for url, count in urls.items() if count > 1)
    if repeated:
        raise DatasetError(f"fight url(s) repeated within the event: {repeated}")
    bout_counts = Counter(row["BOUT"].strip() for row in result_rows)

    fights = [
        _build_fight(
            event,
            position,
            row,
            stats_by_bout.get((event.name, row["BOUT"].strip()), []),
            ambiguous=bout_counts[row["BOUT"].strip()] > 1,
        )
        for position, row in enumerate(result_rows, start=1)
    ]
    return EventBundle(event=event, fights=fights)


def _build_fight(
    event: ParsedEvent,
    position: int,
    row: dict[str, str],
    stat_rows: list[dict[str, str]],
    *,
    ambiguous: bool,
) -> ParsedFight:
    fight_id = source_id_from_url(row["URL"])
    names = [part.strip() for part in row["BOUT"].split(" vs. ")]
    if len(names) != 2 or not all(names):
        raise DatasetError(f"fight {fight_id}: cannot split bout {row['BOUT']!r}")
    fighters = [ParsedFighter(source_id=fighter_key(n), name=n) for n in names]
    fighter_a, fighter_b = order_fighters(fighters[0], fighters[1])

    result = _parse_result(fight_id, row, fighters)
    weight_class, is_title = split_weight_class(row["WEIGHTCLASS"])

    rounds: list[ParsedRound] = []
    if ambiguous:
        logger.warning(
            "fight %s: bout %r occurs more than once in %r; round stats cannot be attributed",
            fight_id,
            row["BOUT"],
            event.name,
        )
    elif stat_rows:
        rounds = _parse_rounds(fight_id, stat_rows, {n: fighter_key(n) for n in names})
    else:
        logger.info("fight %s: no round stats in the dataset", fight_id)

    return ParsedFight(
        source_id=fight_id,
        card_position=position,
        fighter_a=fighter_a,
        fighter_b=fighter_b,
        weight_class=weight_class,
        is_title_fight=is_title,
        scheduled_rounds=scheduled_rounds_from_format(row["TIME FORMAT"]),
        result=result,
        rounds=rounds,
    )


def _parse_result(
    fight_id: str, row: dict[str, str], fighters: list[ParsedFighter]
) -> ParsedResult | None:
    outcome_code = row["OUTCOME"].strip()
    if outcome_code not in _OUTCOMES:
        raise DatasetError(f"fight {fight_id}: unknown outcome {outcome_code!r}")
    outcome, winner_index = _OUTCOMES[outcome_code]
    method = row["METHOD"].strip()
    details = row["DETAILS"].strip()
    try:
        return ParsedResult(
            outcome=outcome,
            winner_source_id=fighters[winner_index].source_id if winner_index is not None else None,
            method=method,
            method_detail=None if method.startswith("Decision") else (details or None),
            end_round=_count(row["ROUND"]),
            end_time_seconds=_minutes_seconds(row["TIME"], what="time"),
            scorecards=parse_scorecards(method, details),
            bonuses=[],  # not in this dataset (Fight/Performance of the Night)
        )
    except (ValueError, ValidationError) as exc:
        logger.warning(
            "fight %s: result unusable (%s); left without result", fight_id, _safe_message(exc)
        )
        return None


def _parse_rounds(
    fight_id: str, stat_rows: list[dict[str, str]], keys_by_name: dict[str, str]
) -> list[ParsedRound]:
    """All-or-nothing: one unusable row discards the fight's round data (never guess)."""
    try:
        rounds: list[ParsedRound] = []
        for row in stat_rows:
            label = row["ROUND"].strip()
            if not label.startswith("Round "):
                raise ValueError(f"empty or unknown round label {label!r}")
            fighter = row["FIGHTER"].strip()
            if fighter not in keys_by_name:
                raise ValueError(f"stats for {fighter!r}, who is not in the bout")
            sig_landed, sig_attempted = _landed_of_attempted(row["SIG.STR."])
            total_landed, total_attempted = _landed_of_attempted(row["TOTAL STR."])
            td_landed, td_attempted = _landed_of_attempted(row["TD"])
            rounds.append(
                ParsedRound(
                    round_number=_count(label.removeprefix("Round ")),
                    fighter_source_id=keys_by_name[fighter],
                    knockdowns=_count(row["KD"]),
                    sig_strikes_landed=sig_landed,
                    sig_strikes_attempted=sig_attempted,
                    total_strikes_landed=total_landed,
                    total_strikes_attempted=total_attempted,
                    takedowns_landed=td_landed,
                    takedowns_attempted=td_attempted,
                    sub_attempts=_count(row["SUB.ATT"]),
                    reversals=_count(row["REV."]),
                    control_seconds=_minutes_seconds(row["CTRL"], what="control time"),
                )
            )
        return rounds
    except (ValueError, ValidationError) as exc:
        logger.warning(
            "fight %s: round stats unusable (%s); left without round data",
            fight_id,
            _safe_message(exc),
        )
        return []
