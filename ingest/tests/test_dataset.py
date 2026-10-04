import logging
from pathlib import Path

import pytest

from blindcard_ingest.models import EventBundle, ParsedFight
from blindcard_ingest.sources.ufcstats.dataset import (
    FIGHTER_KEY_PREFIX,
    ParsedDataset,
    parse_dataset,
    parse_events,
    parse_scorecards,
    scheduled_rounds_from_format,
    split_weight_class,
)

CSV_DIR = Path(__file__).parent / "fixtures" / "csv"

ROSAS = "7e654edcddd71550"  # UFC Fight Night: Rosas Jr. vs. Barcelos (2026-09-26)
BURNS = "c3ac8d0da7b05772"  # has a majority draw
SONG = "1e75e6c9de99fa76"  # has a no contest
NOCHE = "5efaaf313b652dd7"  # also present under a stale duplicate name in results
JAPAN = "29f935654825331b"  # Sakuraba vs. Silveira happens twice
BRAZIL = "32a3025d5db456ae"  # old event, some bouts have empty stat rows
UFC22 = "afaad7d6a581e307"  # control time recorded as "--"


@pytest.fixture(scope="module")
def dataset() -> ParsedDataset:
    return parse_dataset(
        *(CSV_DIR.joinpath(f"{n}.csv").read_text("utf-8") for n in ("events", "results", "stats"))
    )


def fight(bundle: EventBundle, source_id: str) -> ParsedFight:
    return next(f for f in bundle.fights if f.source_id == source_id)


# --- events -------------------------------------------------------------------------------


def test_events_are_parsed_from_the_events_table() -> None:
    events = parse_events((CSV_DIR / "events.csv").read_text("utf-8"))
    assert len(events) == 7
    rosas = next(e for e in events if e.source_id == ROSAS)
    assert rosas.name == "UFC Fight Night: Rosas Jr. vs. Barcelos"
    assert rosas.event_date.isoformat() == "2026-09-26"
    assert rosas.location == "Las Vegas, Nevada, USA"


def test_the_fixture_dataset_has_no_unusable_events(dataset: ParsedDataset) -> None:
    assert dataset.event_errors == {}
    assert len(dataset.bundles) == 7


def test_stale_duplicate_event_name_is_dropped_by_the_join(dataset: ParsedDataset) -> None:
    """Results hold the same 14 fights under 'UFC Fight Night: Lopes vs. Silva' (an old name)."""
    bundle = dataset.bundles[NOCHE]
    assert len(bundle.fights) == 14
    assert len({f.source_id for f in bundle.fights}) == 14


# --- a normal modern fight ----------------------------------------------------------------


def test_main_event_is_card_position_one_with_full_data(dataset: ParsedDataset) -> None:
    bundle = dataset.bundles[ROSAS]
    assert [f.card_position for f in bundle.fights] == list(range(1, 13))
    main = bundle.fights[0]
    assert main.source_id == "0e55d8a3d7a73912"
    assert main.weight_class == "Bantamweight"
    assert main.is_title_fight is False
    assert main.scheduled_rounds == 5
    assert main.completeness_problems() == []

    assert main.result is not None
    assert main.result.outcome == "win"
    assert main.result.winner_source_id == "name:raul-rosas-jr"
    assert (main.result.method, main.result.end_round, main.result.end_time_seconds) == (
        "KO/TKO",
        5,
        98,
    )
    assert main.result.method_detail == "to From Half GuardBarcelos injury"
    assert main.result.bonuses == []


def test_fighter_order_ignores_who_was_listed_first_and_who_won(dataset: ParsedDataset) -> None:
    main = dataset.bundles[ROSAS].fights[0]  # "Raul Rosas Jr. vs. Raoni Barcelos", Rosas won
    assert main.fighter_a.name == "Raoni Barcelos"
    assert main.fighter_b.name == "Raul Rosas Jr."
    for bundle in dataset.bundles.values():
        for f in bundle.fights:
            assert f.fighter_a.source_id < f.fighter_b.source_id


def test_fighters_are_keyed_by_name_and_never_look_like_hex_ids(dataset: ParsedDataset) -> None:
    for bundle in dataset.bundles.values():
        for f in bundle.fights:
            for fighter in (f.fighter_a, f.fighter_b):
                assert fighter.source_id.startswith(FIGHTER_KEY_PREFIX)


def test_round_stats_are_read_exactly(dataset: ParsedDataset) -> None:
    main = dataset.bundles[ROSAS].fights[0]
    assert len(main.rounds) == 10
    barcelos_r4 = next(
        r
        for r in main.rounds
        if r.fighter_source_id == "name:raoni-barcelos" and r.round_number == 4
    )
    assert (barcelos_r4.sig_strikes_landed, barcelos_r4.sig_strikes_attempted) == (8, 18)
    assert (barcelos_r4.total_strikes_landed, barcelos_r4.total_strikes_attempted) == (63, 80)
    assert (barcelos_r4.takedowns_landed, barcelos_r4.takedowns_attempted) == (2, 3)
    assert barcelos_r4.sub_attempts == 5
    assert barcelos_r4.control_seconds == 210  # 3:30


def test_winner_comes_from_the_outcome_column_not_the_listing(dataset: ParsedDataset) -> None:
    dumont_perez = fight(dataset.bundles[ROSAS], "5e5d01e437bced71")  # outcome L/W
    assert dumont_perez.result is not None
    assert dumont_perez.result.winner_source_id == "name:ailin-perez"


# --- result kinds -------------------------------------------------------------------------


def test_unanimous_decision_has_scorecards_and_no_method_detail(dataset: ParsedDataset) -> None:
    result = fight(dataset.bundles[ROSAS], "5e5d01e437bced71").result
    assert result is not None
    assert result.method == "Decision - Unanimous"
    assert result.method_detail is None
    assert result.scorecards == ["Mike Bell 28 - 29", "Eric Colon 28 - 29", "Sal D'amato 28 - 29"]


def test_split_decision(dataset: ParsedDataset) -> None:
    result = fight(dataset.bundles[ROSAS], "577011f3bbcf7f91").result
    assert result is not None
    assert result.method == "Decision - Split"
    assert result.winner_source_id == "name:alatengheili"  # L/W
    assert len(result.scorecards) == 3


def test_submission_detail_is_trimmed(dataset: ParsedDataset) -> None:
    result = fight(dataset.bundles[ROSAS], "7c954175878dd610").result
    assert result is not None
    assert (result.method, result.method_detail) == ("Submission", "Guillotine Choke Standing")


def test_overtime_format_with_five_minute_rounds_counts_scheduled_rounds(
    dataset: ParsedDataset,
) -> None:
    dq = fight(dataset.bundles[ROSAS], "3a70ed81e5611d24")  # "3 Rnd + OT (5-5-5-5)", DQ
    assert dq.scheduled_rounds == 3
    assert dq.result is not None
    assert dq.result.method == "DQ"
    assert dq.result.winner_source_id == "name:ilimbek-akylbek"


def test_majority_draw_is_a_draw_without_winner(dataset: ParsedDataset) -> None:
    draw = fight(dataset.bundles[BURNS], "552f7cdaf93e1055")
    assert draw.result is not None
    assert (draw.result.outcome, draw.result.winner_source_id) == ("draw", None)
    assert draw.result.method == "Decision - Majority"
    assert draw.result.scorecards == [
        "Laura Baldwin 27 - 29",
        "Jason Rodgers 28 - 28",
        "Mike Bell 28 - 28",
    ]
    assert draw.weight_class == "Catch Weight"


def test_no_contest(dataset: ParsedDataset) -> None:
    nc = fight(dataset.bundles[SONG], "7e8749cbf32ef1f8")
    assert nc.result is not None
    assert (nc.result.outcome, nc.result.winner_source_id) == ("no_contest", None)
    assert nc.result.method == "Could Not Continue"


# --- never guess --------------------------------------------------------------------------


def test_placeholder_control_time_means_no_round_data_not_zero(dataset: ParsedDataset) -> None:
    """One fight on this old card has "--" for control time; its neighbours are unaffected."""
    hughes_ignatov = fight(dataset.bundles[UFC22], "d9e86958bcb15c26")
    assert hughes_ignatov.rounds == []
    assert hughes_ignatov.result is not None  # the result itself is fine
    assert "no round data" in hughes_ignatov.completeness_problems()

    shamrock_ortiz = fight(dataset.bundles[UFC22], "b1134affa18449dd")
    assert shamrock_ortiz.completeness_problems() == []
    assert shamrock_ortiz.is_title_fight is True
    assert shamrock_ortiz.weight_class == "Light Heavyweight"


def test_empty_stat_rows_mean_no_round_data(dataset: ParsedDataset) -> None:
    bout = next(
        f
        for f in dataset.bundles[BRAZIL].fights
        if f.fighter_a.name in {"Cesar Marscucci", "Paulo Santos"}
    )
    assert bout.rounds == []


def test_repeated_bout_in_one_event_gets_no_round_data(
    dataset: ParsedDataset, caplog: pytest.LogCaptureFixture
) -> None:
    bundle = dataset.bundles[JAPAN]
    rematch = [
        f for f in bundle.fights if f.fighter_a.name in {"Kazushi Sakuraba", "Marcus Silveira"}
    ]
    assert {f.source_id for f in rematch} == {"ec1bda9a4c2aab42", "2750ac5854e8b28b"}
    assert all(f.rounds == [] and f.result is not None for f in rematch)
    assert all(f.scheduled_rounds is None for f in rematch)  # "1 Rnd + OT (12-3)"


EVENTS_HEADER = "EVENT,URL,DATE,LOCATION\n"
RESULTS_HEADER = (
    "EVENT,BOUT,OUTCOME,WEIGHTCLASS,METHOD,ROUND,TIME,TIME FORMAT,REFEREE,DETAILS,URL\n"
)
STATS_HEADER = (
    "EVENT,BOUT,ROUND,FIGHTER,KD,SIG.STR.,SIG.STR. %,TOTAL STR.,TD,TD %,SUB.ATT,REV.,CTRL,"
    "HEAD,BODY,LEG,DISTANCE,CLINCH,GROUND\n"
)
EVENT_ROW = 'Test Event,http://ufcstats.com/event-details/ev1,"January 2, 2026","Town, Land"\n'


def result_row(fight_id: str, bout: str = "Ann Aa vs. Bob Bb", outcome: str = "W/L") -> str:
    return (
        f"Test Event,{bout},{outcome},Lightweight Bout,Decision - Unanimous ,3,5:00,"
        f"3 Rnd (5-5-5),Ref,Judge One 30 - 27.,http://ufcstats.com/fight-details/{fight_id}\n"
    )


def stat_row(
    fighter: str,
    rnd: int = 1,
    *,
    kd: str = "0",
    ctrl: str = "0:10",
    bout: str = "Ann Aa vs. Bob Bb",
    sig: str = "5 of 9",
) -> str:
    return (
        f"Test Event,{bout},Round {rnd},{fighter},{kd},{sig},55%,9 of 14,0 of 0,---,0,0,{ctrl},"
        "1 of 1,1 of 1,1 of 1,1 of 1,1 of 1,1 of 1\n"
    )


def synthetic(results: str, stats: str) -> ParsedDataset:
    return parse_dataset(EVENTS_HEADER + EVENT_ROW, RESULTS_HEADER + results, STATS_HEADER + stats)


def test_synthetic_baseline_is_complete_and_accepts_float_counts() -> None:
    data = synthetic(
        result_row("f1").replace(",3,5:00,", ",1,5:00,"),
        stat_row("Ann Aa", kd="1.0") + stat_row("Bob Bb"),
    )
    found = data.bundles["ev1"].fights[0]
    assert found.completeness_problems() == []
    assert found.rounds[0].knockdowns == 1


def test_synthetic_repeated_bout_is_not_attributed_even_with_stats() -> None:
    data = synthetic(
        result_row("f1") + result_row("f2"),
        stat_row("Ann Aa") + stat_row("Bob Bb"),
    )
    assert [f.rounds for f in data.bundles["ev1"].fights] == [[], []]


def test_synthetic_stats_for_an_unknown_fighter_discard_the_fights_rounds() -> None:
    data = synthetic(result_row("f1"), stat_row("Ann Aa") + stat_row("Someone Else"))
    assert data.bundles["ev1"].fights[0].rounds == []


@pytest.mark.parametrize("bad", ["--", "---", "", "abc"])
def test_synthetic_unrecorded_control_time_discards_the_fights_rounds(bad: str) -> None:
    data = synthetic(
        result_row("f1").replace(",3,5:00,", ",1,5:00,"),
        stat_row("Ann Aa", ctrl=bad) + stat_row("Bob Bb"),
    )
    assert data.bundles["ev1"].fights[0].rounds == []


def test_synthetic_landed_above_attempted_discards_the_fights_rounds() -> None:
    data = synthetic(
        result_row("f1").replace(",3,5:00,", ",1,5:00,"),
        stat_row("Ann Aa", sig="9 of 5") + stat_row("Bob Bb"),
    )
    assert data.bundles["ev1"].fights[0].rounds == []


def test_synthetic_fight_url_repeated_within_the_event_makes_the_event_unusable() -> None:
    data = synthetic(
        result_row("same", bout="Ann Aa vs. Bob Bb") + result_row("same", bout="Cy Cc vs. Di Dd"),
        "",
    )
    assert "ev1" not in data.bundles
    assert "repeated" in data.event_errors["ev1"]


def test_synthetic_unknown_outcome_makes_the_event_unusable() -> None:
    data = synthetic(result_row("f1", outcome="X/Y"), "")
    assert "unknown outcome" in data.event_errors["ev1"]


def test_synthetic_unparseable_result_time_leaves_the_fight_without_result(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.WARNING)
    data = synthetic(result_row("f1").replace(",5:00,", ",--,"), "")
    found = data.bundles["ev1"].fights[0]
    assert found.result is None
    assert "no result" in found.completeness_problems()
    assert "result unusable" in caplog.text


def test_logs_never_echo_record_values(caplog: pytest.LogCaptureFixture) -> None:
    """Logs may end up public (CI): no input records, winners or fighter data in them."""
    caplog.set_level(logging.DEBUG)
    # A round that fails a model validator (pydantic would echo the whole record) ...
    bad_round = synthetic(
        result_row("f1").replace(",3,5:00,", ",1,5:00,"),
        stat_row("Ann Aa", sig="9 of 5") + stat_row("Bob Bb"),
    )
    # ... and a result that fails field validation.
    bad_result = synthetic(result_row("f2").replace(",3,5:00,", ",0,5:00,"), "")

    assert bad_round.bundles["ev1"].fights[0].rounds == []
    assert bad_result.bundles["ev1"].fights[0].result is None
    assert "landed exceed attempted" in caplog.text
    assert "unusable" in caplog.text
    for forbidden in ("input_value", "winner", "Ann Aa", "Bob Bb", "name:", "Decision"):
        assert forbidden not in caplog.text


# --- field helpers ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("UFC Light Heavyweight Title Bout", ("Light Heavyweight", True)),
        ("UFC Heavyweight Title Bout", ("Heavyweight", True)),
        ("UFC Interim Lightweight Title Bout", ("Lightweight", True)),
        ("UFC Women's Strawweight Title Bout", ("Women's Strawweight", True)),
        ("UFC Superfight Championship Bout", (None, True)),
        ("Light Heavyweight Bout", ("Light Heavyweight", False)),
        ("Women's Bantamweight Bout", ("Women's Bantamweight", False)),
        ("Catch Weight Bout", ("Catch Weight", False)),
        ("Open Weight Bout", ("Open Weight", False)),
        ("Ultimate Fighter 33 Welterweight Tournament Title Bout", ("Welterweight", False)),
        ("Road to UFC 3 Women's Strawweight Tournament TitleBout", ("Women's Strawweight", False)),
        ("UFC 10 Tournament Title Bout", (None, False)),
    ],
)
def test_weight_class_and_title_split(raw: str, expected: tuple[str | None, bool]) -> None:
    weight_class, is_title = split_weight_class(raw)
    assert (weight_class, is_title) == expected
    assert weight_class is None or "UFC" not in weight_class


@pytest.mark.parametrize(
    ("time_format", "expected"),
    [
        ("3 Rnd (5-5-5)", 3),
        ("5 Rnd (5-5-5-5-5)", 5),
        ("2 Rnd (5-5)", 2),
        ("3 Rnd + OT (5-5-5-5)", 3),
        ("1 Rnd + OT (12-3)", None),
        ("1 Rnd + 2OT (15-3-3)", None),
        ("1 Rnd (20)", None),
        ("No Time Limit", None),
        ("5 Rnd (5-5-5)", None),  # malformed: count does not match
        ("", None),
    ],
)
def test_scheduled_rounds_only_for_five_minute_rounds(
    time_format: str, expected: int | None
) -> None:
    assert scheduled_rounds_from_format(time_format) == expected


def test_scorecards_only_for_decisions() -> None:
    details = "Adalaide Byrd 27 - 30.Sal D'amato 27 - 30.Chris Lee 27 - 30."
    assert parse_scorecards("Decision - Unanimous ", details) == [
        "Adalaide Byrd 27 - 30",
        "Sal D'amato 27 - 30",
        "Chris Lee 27 - 30",
    ]
    assert parse_scorecards("KO/TKO", details) == []
    assert parse_scorecards("Decision - Split", "") == []
