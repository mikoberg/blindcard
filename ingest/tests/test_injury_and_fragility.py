"""Injury stoppages are not finishes; a finish can depend on how often the fighters were stopped."""

from __future__ import annotations

import datetime as dt

import pytest

from blindcard_ingest.fit.recipe import FIXED_WEIGHTS, SCORE_FEATURES
from blindcard_ingest.scoring.career import KO_PRONE_USUAL, HistoryBout, career_contexts
from blindcard_ingest.scoring.features import (
    compute_raw_features,
    is_injury_stoppage,
)
from tests.helpers import A, B, rnd, scoring_input, three_round_decision_rounds


def _rounds() -> list:
    return [rnd(1, A, sig=10), rnd(1, B, sig=4)]


def _raw(method: str, detail: str | None, end_time: int = 69, scheduled: int = 5) -> dict:
    return compute_raw_features(
        scoring_input(
            _rounds(),
            method=method,
            end_round=1,
            end_time=end_time,
            scheduled=scheduled,
            method_detail=detail,
        )
    )


def test_injury_detail_is_not_a_real_finish() -> None:
    raw = _raw("KO/TKO", "toMcGregor knee injury")
    assert raw["finish"] == 1.0  # v1..v8 keep their meaning
    assert raw["real_finish"] == 0.0
    assert raw["real_early_finish"] == 0.0
    assert raw["cut_short"] > 0.9  # 69 s of a 25 minute fight


def test_cuts_and_corner_stoppages_stay_real_finishes() -> None:
    assert _raw("TKO - Doctor's Stoppage", "Facial Cut")["real_finish"] == 1.0
    assert _raw("KO/TKO", "toCorner Stoppage")["real_finish"] == 1.0
    assert _raw("KO/TKO", "Punch to Head At Distance")["cut_short"] == 0.0
    assert not is_injury_stoppage("U-DEC", "to Knee Injury")


def test_could_not_continue_early_is_cut_short() -> None:
    raw = _raw("Could Not Continue", None, end_time=120, scheduled=3)
    assert raw["real_finish"] == 0.0
    assert raw["cut_short"] > 0.8


def test_history_counts_finishes_and_ko_losses_before_the_bout_only() -> None:
    day = dt.date
    bouts = [
        HistoryBout("f1", day(2020, 1, 1), 3, False, "a", "x", "x", ended_by="ko"),
        HistoryBout("f2", day(2021, 1, 1), 3, False, "a", "y", "a", ended_by="sub"),
        HistoryBout("f3", day(2022, 1, 1), 3, False, "a", "b", "a", ended_by="ko"),
    ]
    contexts = career_contexts(bouts)
    before_f3 = contexts["f3"]
    assert before_f3.prior_finishes == (2, 0)
    assert before_f3.prior_ko_losses == (1, 0)
    assert before_f3.ko_prone == 1 / (2 + 4)  # shrunk towards 0, the same for both sides
    assert contexts["f1"].prior_finishes == (0, 0)


def test_expected_ko_only_for_real_ko_and_is_symmetric() -> None:
    bouts = [
        HistoryBout("old", dt.date(2020, 1, 1), 3, False, "a", "x", "x", ended_by="ko"),
        HistoryBout("new", dt.date(2021, 1, 1), 3, False, "a", "b", "a", ended_by="ko"),
    ]
    context = career_contexts(bouts)["new"]
    swapped = career_contexts(
        [
            HistoryBout("old", dt.date(2020, 1, 1), 3, False, "a", "x", "x", ended_by="ko"),
            HistoryBout("new", dt.date(2021, 1, 1), 3, False, "b", "a", "a", ended_by="ko"),
        ]
    )["new"]
    assert context.ko_prone == swapped.ko_prone > 0
    inp = scoring_input(_rounds(), method="KO/TKO", end_round=1, end_time=100, context=context)
    raw = compute_raw_features(inp)
    assert raw["expected_ko"] == context.ko_prone  # v9 keeps its meaning
    assert raw["fragile_ko"] == pytest.approx(context.ko_prone - KO_PRONE_USUAL)
    decision = scoring_input(three_round_decision_rounds(), context=context)
    assert compute_raw_features(decision)["expected_ko"] == 0.0
    assert compute_raw_features(decision)["fragile_ko"] == 0.0


def test_recipe_has_the_editorial_weights_and_leaves_out_the_split_decision() -> None:
    assert FIXED_WEIGHTS["cut_short"] < 0 and "fragile_ko" not in FIXED_WEIGHTS
    assert "cut_short" in SCORE_FEATURES and "close_decision" not in SCORE_FEATURES


def test_a_ko_loss_history_at_or_below_the_usual_costs_nothing() -> None:
    bouts = [
        HistoryBout(f"h{i}", dt.date(2010 + i, 1, 1), 3, False, "a", f"x{i}", "a", ended_by="other")
        for i in range(9)
    ] + [
        HistoryBout("ko", dt.date(2020, 1, 1), 3, False, "a", "x", "x", ended_by="ko"),
        HistoryBout("new", dt.date(2021, 1, 1), 3, False, "a", "b", "a", ended_by="ko"),
    ]
    context = career_contexts(bouts)["new"]
    assert context.ko_prone == pytest.approx(1 / 14)  # 1 KO loss in 10 fights, shrunk
    inp = scoring_input(_rounds(), method="KO/TKO", end_round=1, end_time=100, context=context)
    assert compute_raw_features(inp)["fragile_ko"] == 0.0
