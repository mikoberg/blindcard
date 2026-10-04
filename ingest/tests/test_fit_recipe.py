import dataclasses
import random
import tomllib

import pytest

from blindcard_ingest.fit.dataset import LabeledRow
from blindcard_ingest.fit.recipe import (
    BLEND_GRID,
    SCORE_FEATURES,
    FitResult,
    fit_scoring,
    format_report,
    leak_problems,
    render_config_toml,
)
from blindcard_ingest.scoring.config import (
    StarThreshold,
    parse_scoring_config,
)
from blindcard_ingest.scoring.features import FEATURE_NAMES, MethodKind

THRESHOLDS = (StarThreshold(0, 1.0), StarThreshold(50, 3.0), StarThreshold(90, 5.0))


def synthetic_rows(seed: int = 1) -> list[LabeledRow]:
    """Fights whose Fight-of-the-Night odds follow two-way action and whose Performance-of-the-
    Night odds follow early finishes, so the recipe has something to find."""
    rng = random.Random(seed)
    rows: list[LabeledRow] = []
    for event in range(120):
        year = 2015 + event % 12
        for position in range(1, 9):
            ko = rng.random() < 0.35
            raw = {name: 0.0 for name in FEATURE_NAMES}
            action = rng.random()
            raw.update(
                pace=4 + 8 * action + rng.random(),
                min_pace=1 + 4 * action,
                swings=float(rng.randint(0, 3)) * action,
                knockdowns=float(ko),
                ko_finish=1.0 if ko else 0.0,
                time_fraction=0.2 + 0.1 * rng.random() if ko else 1.0,
                early_finish=0.8 if ko else 0.0,
                finish=1.0 if ko else 0.0,
                competitiveness=rng.random(),
            )
            rows.append(
                LabeledRow(
                    fight_id=f"f{event}-{position}",
                    event_source_id=f"e{event}",
                    year=year,
                    card_position=position,
                    fights_on_card=8,
                    is_title_fight=False,
                    method=MethodKind.KO_TKO if ko else MethodKind.DECISION_UNANIMOUS,
                    end_round=1 if ko else 3,
                    raw=raw,
                    fotn=rng.random() < 0.02 + 0.5 * action**4 * (not ko),
                    potn=ko and rng.random() < 0.6,
                )
            )
    return rows


@pytest.fixture(scope="module")
def result() -> FitResult:
    rows = synthetic_rows()
    return fit_scoring(rows, [r.raw for r in rows], cap_quantile=0.99)


def test_the_score_has_no_duration_features_and_follows_the_action(result: FitResult) -> None:
    assert set(result.weights) <= set(SCORE_FEATURES)
    assert "time_fraction" not in result.weights
    assert "early_finish" not in result.weights
    assert result.weights["min_pace"] > 0
    assert max(abs(w) for w in result.weights.values()) == 1.0


def test_ko_and_submission_are_one_factor_and_a_finish_never_counts_against_a_fight(
    result: FitResult,
) -> None:
    assert "ko_finish" not in result.weights and "sub_finish" not in result.weights
    assert result.weights.get("finish", 0.0) >= 0


def test_a_finish_adds_to_the_score_when_the_margin_allows_it(result: FitResult) -> None:
    assert result.blend > 0
    assert result.weights["finish"] > 0


def test_held_out_metrics_cover_both_bonus_kinds(result: FitResult) -> None:
    score = result.metrics["score"]
    assert score.fotn_auc > 0.5 and score.potn_auc > 0.5
    assert result.test_from_year == 2024 and result.train_fights and result.test_fights


def test_the_blend_stays_inside_the_leak_margin_on_the_training_years(result: FitResult) -> None:
    assert 0.0 <= result.blend <= BLEND_GRID[-1]
    assert result.shipped_finish_auc <= 0.5 + result.finish_leak + 0.05


def test_the_fit_is_deterministic() -> None:
    rows = synthetic_rows()
    first = fit_scoring(rows, [r.raw for r in rows], cap_quantile=0.99)
    again = fit_scoring(synthetic_rows(), [r.raw for r in rows], cap_quantile=0.99)
    assert first == again


def test_a_baseline_adds_a_comparison_row() -> None:
    rows = synthetic_rows()
    baseline = {r.fight_id: r.raw["pace"] for r in rows}
    result = fit_scoring(rows, [r.raw for r in rows], cap_quantile=0.99, baseline=baseline)
    assert list(result.metrics) == ["v1", "score"]
    assert "v1" in format_report(result)


def test_no_fights_on_one_side_of_the_split_is_an_error() -> None:
    rows = [r for r in synthetic_rows() if r.year < 2024]
    with pytest.raises(ValueError, match="both sides"):
        fit_scoring(rows, [r.raw for r in rows], cap_quantile=0.99)


def test_the_report_names_no_fights(result: FitResult) -> None:
    report = format_report(result)
    assert "FOTN-AUC" in report
    assert "f1-1" not in report and "e1" not in report


def test_rendered_toml_parses_back_to_one_score_with_the_same_weights(result: FitResult) -> None:
    text = render_config_toml(
        result, version=3, cap_quantile=0.99, min_pool_size=100, star_thresholds=THRESHOLDS
    )
    config = parse_scoring_config(tomllib.loads(text))
    assert config.version == 3
    assert config.weights == result.weights
    assert config.performance_weights == {}  # one score: no second axis
    assert "[performance" not in text
    assert [(t.min_percentile, t.stars) for t in config.star_thresholds] == [
        (0.0, 1.0),
        (50.0, 3.0),
        (90.0, 5.0),
    ]
    assert "Held-out numbers" in text and "never subtracts" in text


def test_the_shipped_weights_are_checked_against_the_margin(result: FitResult) -> None:
    assert 0.0 <= result.shipped_finish_auc <= 1.0
    assert "shipped weights" in format_report(result)
    assert "shipped weights, all labelled fights" in render_config_toml(
        result, version=3, cap_quantile=0.99, min_pool_size=100, star_thresholds=THRESHOLDS
    )


def test_a_leaking_or_grid_edge_fit_is_flagged(result: FitResult) -> None:
    leaky = dataclasses.replace(result, shipped_finish_auc=0.99, blend=BLEND_GRID[-1])
    assert len(leak_problems(leaky)) == 2 and "WARNING" in format_report(leaky)
    fine = dataclasses.replace(result, shipped_finish_auc=0.5, blend=0.1)
    assert leak_problems(fine) == []


def test_the_fit_drops_a_finish_weight_that_comes_out_negative() -> None:
    """Here Fight of the Night goes to long fights, so a free fit would punish finishes."""
    rows = synthetic_rows()
    penalised = [
        dataclasses.replace(r, fotn=bool(r.raw["pace"] > 9 and not r.finished)) for r in rows
    ]
    result = fit_scoring(penalised, [r.raw for r in penalised], cap_quantile=0.99, finish_leak=0.0)
    assert result.weights.get("finish", 0.0) >= 0.0


def test_a_larger_leak_margin_gives_finishes_at_least_as_much_credit() -> None:
    rows = synthetic_rows()
    strict = fit_scoring(rows, [r.raw for r in rows], cap_quantile=0.99, finish_leak=0.0)
    loose = fit_scoring(rows, [r.raw for r in rows], cap_quantile=0.99, finish_leak=0.4)
    assert loose.blend >= strict.blend
    assert loose.weights.get("finish", 0.0) >= strict.weights.get("finish", 0.0)
    assert loose.metrics["score"].finish_auc >= strict.metrics["score"].finish_auc
    assert loose.finish_leak == 0.4


def test_the_margin_is_written_into_the_config_header(result: FitResult) -> None:
    text = render_config_toml(
        result, version=3, cap_quantile=0.99, min_pool_size=100, star_thresholds=THRESHOLDS
    )
    assert f"within {result.finish_leak} of neutral" in text
