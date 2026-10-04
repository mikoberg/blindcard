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
