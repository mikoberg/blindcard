import pytest
from helpers import A, B, rnd, scoring_input, three_round_decision_rounds

from blindcard_ingest.scoring.features import (
    FEATURE_NAMES,
    MethodKind,
    classify_method,
    compute_raw_features,
    scoring_problems,
)


@pytest.mark.parametrize(
    ("method", "kind"),
    [
        ("KO/TKO", MethodKind.KO_TKO),
        ("TKO - Doctor's Stoppage", MethodKind.KO_TKO),
        ("SUB", MethodKind.SUBMISSION),
        ("Submission", MethodKind.SUBMISSION),
        ("U-DEC", MethodKind.DECISION_UNANIMOUS),
        ("S-DEC", MethodKind.DECISION_SPLIT),
        ("M-DEC", MethodKind.DECISION_MAJORITY),
        ("Decision - Split", MethodKind.DECISION_SPLIT),
        ("DQ", MethodKind.DISQUALIFICATION),
        ("Overturned", MethodKind.NO_RESULT),
        ("Could Not Continue", MethodKind.NO_RESULT),
        ("CNC", MethodKind.NO_RESULT),
        ("Other", MethodKind.NO_RESULT),
        ("Mystery Method", MethodKind.UNKNOWN),
        ("", MethodKind.UNKNOWN),
    ],
)
def test_classify_method(method: str, kind: MethodKind) -> None:
    assert classify_method(method) is kind


def test_decision_features_hand_calculated() -> None:
    raw = compute_raw_features(scoring_input(three_round_decision_rounds()))
    assert set(raw) == set(FEATURE_NAMES)
    assert raw["pace"] == pytest.approx(110 / 15)  # 110 sig strikes over 15 minutes
    assert raw["knockdowns"] == 0
    assert raw["sub_attempts"] == 1
    assert raw["reversals"] == 1
    assert raw["swings"] == 2  # A leads R1, B leads R2, A leads R3
    assert raw["finish"] == 0
    assert raw["finish_lateness"] == 0
    assert raw["close_decision"] == 0  # unanimous
    assert raw["competitiveness"] == pytest.approx(1 - 10 / 110)
    assert raw["control_share"] == pytest.approx(90 / 900)


def test_split_decision_is_a_close_decision() -> None:
    raw = compute_raw_features(scoring_input(three_round_decision_rounds(), method="S-DEC"))
    assert raw["close_decision"] == 1


def test_finish_lateness_is_fraction_of_scheduled_time() -> None:
    rounds = [rnd(1, A, sig=10), rnd(1, B, sig=5, kd=1), rnd(2, A, sig=4), rnd(2, B, sig=2)]
    raw = compute_raw_features(
        scoring_input(rounds, method="KO/TKO", end_round=2, end_time=100, scheduled=3)
    )
    assert raw["finish"] == 1
    assert raw["finish_lateness"] == pytest.approx(400 / 900)
    assert raw["knockdowns"] == 1
    assert raw["pace"] == pytest.approx(21 / (400 / 60))


def test_tied_round_is_skipped_when_counting_swings() -> None:
    rounds = [
        rnd(1, A, sig=10),
        rnd(1, B, sig=5),
        rnd(2, A, sig=7),  # tied round, nobody leads
        rnd(2, B, sig=7),
        rnd(3, A, sig=10),
        rnd(3, B, sig=5),
    ]
    assert compute_raw_features(scoring_input(rounds))["swings"] == 0


def test_knockdown_breaks_a_strike_tie() -> None:
    rounds = [
        rnd(1, A, sig=10),
        rnd(1, B, sig=5),
        rnd(2, A, sig=7),
        rnd(2, B, sig=7, kd=1),  # B leads on the knockdown
        rnd(3, A, sig=10),
        rnd(3, B, sig=5),
    ]
    assert compute_raw_features(scoring_input(rounds))["swings"] == 2


def test_one_round_fight_has_no_swings_and_no_strikes_means_zero_competitiveness() -> None:
    rounds = [rnd(1, A), rnd(1, B)]
    raw = compute_raw_features(
        scoring_input(rounds, method="SUB", end_round=1, end_time=60, scheduled=3)
    )
    assert raw["swings"] == 0
    assert raw["competitiveness"] == 0
    assert raw["finish"] == 1


def test_disqualification_is_neither_finish_nor_close_decision() -> None:
    raw = compute_raw_features(scoring_input(three_round_decision_rounds(), method="DQ"))
    assert raw["finish"] == 0
    assert raw["close_decision"] == 0


@pytest.mark.parametrize(
    ("kwargs", "fragment"),
    [
        ({"method": "Mystery Method"}, "method not classifiable"),
        ({"scheduled": None}, "scheduled rounds unknown"),
        ({"end_round": 1, "end_time": 0}, "duration is zero"),
    ],
)
def test_unscorable_fights_are_reported_not_guessed(kwargs: dict, fragment: str) -> None:
    inp = scoring_input(three_round_decision_rounds(), **kwargs)
    assert any(fragment in p for p in scoring_problems(inp))
    with pytest.raises(ValueError, match=fragment):
        compute_raw_features(inp)


def test_problem_messages_do_not_contain_the_result_method() -> None:
    """Problem texts reach CI logs, so the method (a result) must not be in them."""
    for method in ("Mystery Method", "Technical Whatever"):
        problems = scoring_problems(scoring_input(three_round_decision_rounds(), method=method))
        assert problems == ["method not classifiable"]
        assert method not in " ".join(problems)


@pytest.mark.parametrize("method", ["Could Not Continue", "Overturned", "CNC", "Other"])
def test_no_result_methods_are_scored_from_their_real_stats_as_no_finish(method: str) -> None:
    """A missing score would itself reveal "no contest" on the public card, so these get one."""
    rounds = [rnd(1, A, sig=12, kd=1, subs=1), rnd(1, B, sig=8, control=30)]
    inp = scoring_input(rounds, method=method, end_round=1, end_time=120, scheduled=3)
    assert scoring_problems(inp) == []

    raw = compute_raw_features(inp)
    assert raw["finish"] == 0
    assert raw["finish_lateness"] == 0
    assert raw["close_decision"] == 0
    assert raw["pace"] == pytest.approx(20 / 2)  # real stats over the real 2 minutes
    assert raw["knockdowns"] == 1
    assert raw["sub_attempts"] == 1
    assert raw["control_share"] == pytest.approx(30 / 120)


def test_missing_round_data_makes_the_fight_unscorable() -> None:
    rounds = [rnd(1, A, sig=1), rnd(1, B, sig=1), rnd(3, A, sig=1), rnd(3, B, sig=1)]
    problems = scoring_problems(scoring_input(rounds))
    assert "round data does not cover every round" in problems
    assert not any(ch.isdigit() for p in problems for ch in p)  # no round numbers in messages
    assert scoring_problems(scoring_input([])) != []


# --- additional candidate features (used by score versions that weight them) --------------


def test_v1_features_are_a_prefix_subset_of_all_features() -> None:
    from blindcard_ingest.scoring.features import V1_FEATURES

    assert set(V1_FEATURES) < set(FEATURE_NAMES)
    assert len(V1_FEATURES) == 10


def test_new_features_on_a_full_distance_decision() -> None:
    raw = compute_raw_features(scoring_input(three_round_decision_rounds()))
    assert raw["ko_finish"] == 0 and raw["sub_finish"] == 0
    assert raw["early_finish"] == 0
    assert raw["time_fraction"] == pytest.approx(1.0)
    assert raw["control_share_nofinish"] == pytest.approx(90 / 900)  # no finish: stalling counts
    assert raw["min_pace"] == pytest.approx(50 / 15)  # the less active fighter: B, 50 in 15 min
    assert raw["total_pace"] == pytest.approx(110 / 15)
    assert raw["knockdowns_both"] == 0
    assert raw["takedown_rate"] == 0


def test_a_knockout_is_early_and_control_before_it_is_not_stalling() -> None:
    rounds = [
        rnd(1, A, sig=10, kd=1, control=120),
        rnd(1, B, sig=5),
        rnd(2, A, sig=4),
        rnd(2, B, sig=2, kd=1),
    ]
    raw = compute_raw_features(
        scoring_input(rounds, method="KO/TKO", end_round=2, end_time=100, scheduled=3)
    )
    assert raw["ko_finish"] == 1 and raw["sub_finish"] == 0
    assert raw["early_finish"] == pytest.approx(1 - 400 / 900)
    assert raw["time_fraction"] == pytest.approx(400 / 900)
    assert raw["control_share"] == pytest.approx(120 / 400)  # v1's view: penalised
    assert raw["control_share_nofinish"] == 0  # v2's view: a finish came out of it
    assert raw["knockdowns_both"] == 1  # both fighters scored a knockdown
    assert raw["min_pace"] == pytest.approx(7 / (400 / 60))


def test_a_submission_is_a_submission_finish() -> None:
    rounds = [rnd(1, A, sig=3, subs=2), rnd(1, B, sig=1)]
    raw = compute_raw_features(
        scoring_input(rounds, method="SUB", end_round=1, end_time=60, scheduled=3)
    )
    assert raw["sub_finish"] == 1 and raw["ko_finish"] == 0
    assert raw["early_finish"] == pytest.approx(1 - 60 / 900)


def test_non_finishes_never_count_as_early_finishes() -> None:
    for method in ("DQ", "Overturned", "Could Not Continue", "U-DEC"):
        raw = compute_raw_features(scoring_input(three_round_decision_rounds(), method=method))
        assert raw["early_finish"] == 0 and raw["ko_finish"] == 0 and raw["sub_finish"] == 0


def test_takedown_rate_is_takedowns_landed_per_minute_for_both_fighters() -> None:
    rounds = [rnd(1, A, sig=1, td=2), rnd(1, B, sig=1), rnd(2, A, sig=1), rnd(2, B, sig=1, td=1)]
    raw = compute_raw_features(
        scoring_input(rounds, method="U-DEC", end_round=2, end_time=300, scheduled=2)
    )
    assert raw["takedown_rate"] == pytest.approx(3 / 10)  # 3 takedowns in 10 minutes


# --- stakes: where the bout sat on the card (known before the fight) -------------------------


def test_stakes_come_from_the_card_position_and_the_title_flag() -> None:
    rounds = three_round_decision_rounds()
    plain = compute_raw_features(scoring_input(rounds))
    assert plain["main_event"] == 0 and plain["co_main"] == 0 and plain["title_fight"] == 0

    main = compute_raw_features(scoring_input(rounds, card_position=1, is_title_fight=True))
    assert (main["main_event"], main["co_main"], main["title_fight"]) == (1, 0, 1)

    co_main = compute_raw_features(scoring_input(rounds, card_position=2))
    assert (co_main["main_event"], co_main["co_main"], co_main["title_fight"]) == (0, 1, 0)

    undercard = compute_raw_features(scoring_input(rounds, card_position=9))
    assert undercard["main_event"] == 0 and undercard["co_main"] == 0


def test_volume_is_all_significant_strikes_landed_and_five_rounds_follows_the_schedule() -> None:
    rounds = three_round_decision_rounds()  # 110 significant strikes landed in total
    raw = compute_raw_features(scoring_input(rounds))
    assert raw["volume"] == 110 and raw["five_rounds"] == 0
    five = compute_raw_features(scoring_input(rounds, end_round=3, end_time=300, scheduled=5))
    assert five["five_rounds"] == 1 and five["volume"] == 110
