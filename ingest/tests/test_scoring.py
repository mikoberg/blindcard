import dataclasses
from pathlib import Path

import pytest

from blindcard_ingest.scoring.config import (
    ScoringConfig,
    ScoringConfigError,
    StarThreshold,
    load_scoring_config,
    parse_scoring_config,
)
from blindcard_ingest.scoring.features import V1_FEATURES
from blindcard_ingest.scoring.scorer import (
    QUANTILE_STEPS,
    Reference,
    ScoringError,
    build_reference,
    composite_of,
    normalise,
    percentile_of,
    quantile,
    score,
    stars_for_percentile,
)
from blindcard_ingest.settings import DEFAULT_SCORING_CONFIG_DIR


@pytest.fixture
def config() -> ScoringConfig:
    return load_scoring_config(DEFAULT_SCORING_CONFIG_DIR, 1)


def raw_fight(i: int) -> dict[str, float]:
    """Deterministic synthetic fight; larger i = more exciting."""
    return {
        "pace": 2.0 + i * 0.1,
        "knockdowns": float(i % 3),
        "sub_attempts": float(i % 4),
        "reversals": float(i % 2),
        "swings": float(i % 5),
        "finish": float(i % 2),
        "finish_lateness": (i % 10) / 10,
        "close_decision": float((i + 1) % 2),
        "competitiveness": 0.3 + (i % 7) / 10,
        "control_share": (i % 5) / 10,
    }


@pytest.fixture
def pool() -> list[dict[str, float]]:
    return [raw_fight(i) for i in range(200)]


# --- config -------------------------------------------------------------------------------


def test_shipped_v1_config_is_valid(config: ScoringConfig) -> None:
    assert config.version == 1
    assert set(config.weights) == set(V1_FEATURES)
    assert config.weights["control_share"] < 0
    assert config.star_thresholds[0] == StarThreshold(0, 1.0)
    assert config.star_thresholds[-1].stars == 5.0


def test_config_version_must_match_filename(tmp_path: Path) -> None:
    text = (DEFAULT_SCORING_CONFIG_DIR / "scoring_v1.toml").read_text(encoding="utf-8")
    (tmp_path / "scoring_v2.toml").write_text(text, encoding="utf-8")  # still says version = 1
    with pytest.raises(ScoringConfigError, match="declares version 1, expected 2"):
        load_scoring_config(tmp_path, 2)


def test_missing_config_file(tmp_path: Path) -> None:
    with pytest.raises(ScoringConfigError, match="not found"):
        load_scoring_config(tmp_path, 9)


def _config_dict(config: ScoringConfig) -> dict:
    return {
        "version": config.version,
        "normalisation": {
            "cap_quantile": config.cap_quantile,
            "min_pool_size": config.min_pool_size,
        },
        "weights": dict(config.weights),
        "stars": {"thresholds": [[t.min_percentile, t.stars] for t in config.star_thresholds]},
    }


def test_config_round_trips_through_parse(config: ScoringConfig) -> None:
    assert parse_scoring_config(_config_dict(config)).weights == config.weights


def test_unknown_weight_or_no_weights_at_all_is_rejected(config: ScoringConfig) -> None:
    data = _config_dict(config)
    data["weights"]["charisma"] = 1.0
    with pytest.raises(ScoringConfigError, match="unknown feature"):
        parse_scoring_config(data)
    data = _config_dict(config)
    data["weights"] = {}
    with pytest.raises(ScoringConfigError, match="at least one"):
        parse_scoring_config(data)


def test_a_config_may_weight_only_some_features(config: ScoringConfig) -> None:
    data = _config_dict(config)
    data["weights"] = {"pace": 1.0, "ko_finish": 2.0}
    parsed = parse_scoring_config(data)
    assert set(parsed.weights) == {"pace", "ko_finish"}


@pytest.mark.parametrize(
    "thresholds",
    [
        [],
        [[5, 1.0], [50, 3.0]],  # does not start at 0
        [[0, 1.0], [50, 3.0], [40, 4.0]],  # percentiles not ascending
        [[0, 1.0], [50, 3.0], [60, 2.5]],  # stars not ascending
        [[0, 1.0], [50, 3.2]],  # not a half-star step
        [[0, 1.0], [50, 5.5]],  # out of range
    ],
)
def test_invalid_star_thresholds_are_rejected(config: ScoringConfig, thresholds: list) -> None:
    data = _config_dict(config)
    data["stars"]["thresholds"] = thresholds
    with pytest.raises(ScoringConfigError):
        parse_scoring_config(data)


# --- scorer -------------------------------------------------------------------------------


def test_quantile_interpolates() -> None:
    values = [1.0, 2.0, 3.0, 4.0]
    assert quantile(values, 0) == 1.0
    assert quantile(values, 1) == 4.0
    assert quantile(values, 0.5) == pytest.approx(2.5)
    with pytest.raises(ScoringError):
        quantile([], 0.5)


def test_pool_smaller_than_minimum_is_refused(config: ScoringConfig) -> None:
    with pytest.raises(ScoringError, match="need at least 100"):
        build_reference(config, [raw_fight(i) for i in range(10)])


def test_reference_has_expected_shape_and_round_trips(
    config: ScoringConfig, pool: list[dict[str, float]]
) -> None:
    reference = build_reference(config, pool)
    assert len(reference.knots) == QUANTILE_STEPS + 1
    assert reference.knots == sorted(reference.knots)
    assert reference.pool_size == 200
    assert Reference.from_json(reference.to_json()) == reference


def test_normalised_capped_features_stay_within_zero_and_one(
    config: ScoringConfig, pool: list[dict[str, float]]
) -> None:
    reference = build_reference(config, pool)
    extreme = {**raw_fight(0), "pace": 1000.0, "knockdowns": 50.0}
    normalised = normalise(config, reference.caps, extreme)
    assert normalised["pace"] == 1.0
    assert normalised["knockdowns"] == 1.0
    assert all(0 <= v <= 1 for v in normalised.values())


def test_zero_cap_gives_zero_not_a_division_error(config: ScoringConfig) -> None:
    caps = {"pace": 0.0, "knockdowns": 0.0, "sub_attempts": 0.0, "reversals": 0.0, "swings": 0.0}
    normalised = normalise(config, caps, {**raw_fight(3), "pace": 5.0})
    assert normalised["pace"] == 0.0


def test_percentile_is_monotonic_and_clamped(
    config: ScoringConfig, pool: list[dict[str, float]]
) -> None:
    reference = build_reference(config, pool)
    knots = reference.knots
    low, high = knots[0], knots[-1]
    assert percentile_of(knots, low - 1) == 0.0
    assert percentile_of(knots, high + 1) == 100.0
    steps = [low + (high - low) * i / 50 for i in range(51)]
    percentiles = [percentile_of(knots, x) for x in steps]
    assert percentiles == sorted(percentiles)
    assert min(percentiles) >= 0
    assert max(percentiles) <= 100


def test_percentile_of_a_flat_reference_uses_mid_rank() -> None:
    knots = [1.0] * (QUANTILE_STEPS + 1)
    assert percentile_of(knots, 1.0) == pytest.approx(50.0)
    assert percentile_of(knots, 0.5) == 0.0
    assert percentile_of(knots, 2.0) == 100.0


def test_stars_follow_the_configured_thresholds(config: ScoringConfig) -> None:
    assert stars_for_percentile(config, 0) == 1.0
    assert stars_for_percentile(config, 7.99) == 1.0
    assert stars_for_percentile(config, 8) == 1.5
    assert stars_for_percentile(config, 96.99) == 4.5
    assert stars_for_percentile(config, 97) == 5.0
    assert stars_for_percentile(config, 100) == 5.0


def test_better_fights_never_score_lower(
    config: ScoringConfig, pool: list[dict[str, float]]
) -> None:
    reference = build_reference(config, pool)
    dull = score(
        config,
        reference,
        {
            **raw_fight(0),
            "pace": 0.0,
            "swings": 0.0,
            "knockdowns": 0.0,
            "competitiveness": 0.0,
            "control_share": 0.9,
        },
    )
    thrilling = score(
        config,
        reference,
        {
            **raw_fight(199),
            "pace": 50.0,
            "knockdowns": 5.0,
            "swings": 4.0,
            "competitiveness": 1.0,
            "control_share": 0.0,
        },
    )
    assert dull.stars <= thrilling.stars
    assert dull.percentile < thrilling.percentile


def test_scoring_is_deterministic(config: ScoringConfig, pool: list[dict[str, float]]) -> None:
    first = build_reference(config, pool)
    second = build_reference(config, list(pool))
    assert first == second
    assert score(config, first, pool[17]) == score(config, second, pool[17])


def test_new_fights_do_not_move_existing_scores(
    config: ScoringConfig, pool: list[dict[str, float]]
) -> None:
    """Scoring against a frozen reference: adding fights elsewhere changes nothing."""
    reference = build_reference(config, pool)
    before = score(config, reference, pool[50])
    _ = score(config, reference, raw_fight(500))  # a new fight arrives
    assert score(config, reference, pool[50]) == before


def test_weights_come_from_config_not_code(
    config: ScoringConfig, pool: list[dict[str, float]]
) -> None:
    reference = build_reference(config, pool)
    normalised = normalise(config, reference.caps, pool[42])
    heavier = dataclasses.replace(config, weights={**config.weights, "pace": 5.0})
    assert composite_of(heavier, normalised) != composite_of(config, normalised)
    expected = sum(config.weights[n] * normalised[n] for n in config.weights)
    assert composite_of(config, normalised) == pytest.approx(expected)


def test_percentile_is_rounded_for_the_database_column(
    config: ScoringConfig, pool: list[dict[str, float]]
) -> None:
    reference = build_reference(config, pool)
    scored = score(config, reference, pool[33])
    assert scored.percentile == round(scored.percentile, 2)
    assert set(scored.features_json()) == {"raw", "normalised"}


# --- v1 must not change when the feature set grows ----------------------------------------

V1_GOLDEN = [  # (pool index, composite, percentile, stars) captured before the v2 work
    (0, 0.7321616515367956, 0.0, 1.0),
    (17, 3.3004990553430718, 69.85, 3.5),
    (50, 2.4425657803787844, 25.61, 2.0),
    (100, 1.8529699092207732, 5.03, 1.0),
    (199, 4.43, 98.97, 5.0),
]


def test_v1_scores_are_unchanged_golden(
    config: ScoringConfig, pool: list[dict[str, float]]
) -> None:
    reference = build_reference(config, pool)
    assert reference.caps == {
        "pace": 21.701,
        "knockdowns": 2.0,
        "sub_attempts": 3.0,
        "reversals": 1.0,
        "swings": 4.0,
    }
    for index, composite, percentile, stars in V1_GOLDEN:
        scored = score(config, reference, pool[index])
        assert scored.composite == pytest.approx(composite, abs=1e-12)
        assert (scored.percentile, scored.stars) == (percentile, stars)


def test_stored_features_hold_exactly_the_features_the_config_weights(
    config: ScoringConfig, pool: list[dict[str, float]]
) -> None:
    """Extra raw features in the input (new candidates) must not leak into a v1 record."""
    reference = build_reference(config, pool)
    scored = score(config, reference, {**pool[0], "ko_finish": 1.0, "min_pace": 4.0})
    assert set(scored.raw) == set(config.weights)
    assert set(scored.normalised) == set(config.weights)


def test_a_config_with_few_features_only_needs_and_caps_those(
    config: ScoringConfig, pool: list[dict[str, float]]
) -> None:
    small = dataclasses.replace(config, weights={"pace": 1.0, "finish": 2.0})
    reference = build_reference(small, pool)
    assert set(reference.caps) == {"pace"}  # `finish` is binary, not capped
    scored = score(small, reference, pool[10])
    assert set(scored.raw) == {"pace", "finish"}
    assert scored.composite == pytest.approx(
        1.0 * min(pool[10]["pace"], reference.caps["pace"]) / reference.caps["pace"]
        + 2.0 * pool[10]["finish"]
    )


# --- performance axis: a second, private score (shown only after a reveal) -----------------


def _with_performance(config: ScoringConfig) -> ScoringConfig:
    return dataclasses.replace(
        config,
        weights={"pace": 1.0, "swings": 1.0},
        performance_weights={"ko_finish": 2.0, "control_share_nofinish": -1.0},
    )


def _pool_with_new_features(pool: list[dict[str, float]]) -> list[dict[str, float]]:
    return [
        {**raw, "ko_finish": float(i % 3 == 0), "control_share_nofinish": (i % 4) / 4}
        for i, raw in enumerate(pool)
    ]


def test_performance_weights_are_optional_and_validated(config: ScoringConfig) -> None:
    assert config.performance_weights == {}
    data = _config_dict(config)
    data["performance"] = {"weights": {"ko_finish": 2.0}}
    assert parse_scoring_config(data).performance_weights == {"ko_finish": 2.0}
    data["performance"] = {"weights": {"charisma": 1.0}}
    with pytest.raises(ScoringConfigError, match="performance.*unknown feature"):
        parse_scoring_config(data)
    data["performance"] = {"weights": {}}
    with pytest.raises(ScoringConfigError, match="performance.*at least one"):
        parse_scoring_config(data)


def test_config_snapshot_round_trips_and_v1_snapshot_has_no_performance_key(
    config: ScoringConfig,
) -> None:
    assert "performance_weights" not in config.to_json()
    both = _with_performance(config)
    assert ScoringConfig.from_json(both.to_json()) == both


def test_reference_holds_performance_knots_only_when_configured(
    config: ScoringConfig, pool: list[dict[str, float]]
) -> None:
    assert build_reference(config, pool).performance_knots is None
    assert "performance_knots" not in build_reference(config, pool).to_json()
    both = _with_performance(config)
    reference = build_reference(both, _pool_with_new_features(pool))
    assert reference.performance_knots is not None
    assert len(reference.performance_knots) == QUANTILE_STEPS + 1
    assert Reference.from_json(reference.to_json()) == reference


def test_performance_score_is_private_and_leaves_the_public_score_untouched(
    config: ScoringConfig, pool: list[dict[str, float]]
) -> None:
    both = _with_performance(config)
    plain = dataclasses.replace(both, performance_weights={})
    rich_pool = _pool_with_new_features(pool)
    with_perf = score(both, build_reference(both, rich_pool), rich_pool[7])
    without = score(plain, build_reference(plain, rich_pool), rich_pool[7])

    assert (with_perf.composite, with_perf.percentile, with_perf.stars) == (
        without.composite,
        without.percentile,
        without.stars,
    )
    assert with_perf.performance is not None
    assert without.performance is None
    payload = with_perf.features_json()
    assert set(payload["performance"]) == {"composite", "percentile", "stars"}
    assert "performance" not in without.features_json()
    # both axes' features are stored (the private breakdown needs them)
    assert set(with_perf.raw) == {"pace", "swings", "ko_finish", "control_share_nofinish"}


def test_performance_axis_ranks_by_its_own_weights(
    config: ScoringConfig, pool: list[dict[str, float]]
) -> None:
    both = _with_performance(config)
    rich_pool = _pool_with_new_features(pool)
    reference = build_reference(both, rich_pool)
    knockout = {**rich_pool[0], "ko_finish": 1.0, "control_share_nofinish": 0.0}
    decision = {**rich_pool[0], "ko_finish": 0.0, "control_share_nofinish": 1.0}
    top, bottom = score(both, reference, knockout), score(both, reference, decision)
    assert top.performance is not None and bottom.performance is not None
    assert top.performance.percentile > bottom.performance.percentile
    assert top.performance.stars > bottom.performance.stars
    assert top.stars == bottom.stars  # the public axis does not see either feature
