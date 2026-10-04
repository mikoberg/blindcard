import pytest
from helpers import A, B, make_fight, rnd
from pydantic import ValidationError

from blindcard_ingest.models import (
    ParsedFight,
    ParsedFighter,
    ParsedResult,
    ParsedRound,
    order_fighters,
    slugify,
)


def fighter(source_id: str) -> ParsedFighter:
    return ParsedFighter(source_id=source_id, name=f"Fighter {source_id}")


def test_fighter_order_ignores_listing_order() -> None:
    """The listing order correlates with the winner; a/b must come out the same either way."""
    assert order_fighters(fighter(A), fighter(B)) == order_fighters(fighter(B), fighter(A))
    a, b = order_fighters(fighter(B), fighter(A))
    assert (a.source_id, b.source_id) == (A, B)


def test_fighter_order_is_independent_of_who_won() -> None:
    winner_listed_first = make_fight(listing_first=A, listing_second=B, winner=A)
    loser_listed_first = make_fight(listing_first=B, listing_second=A, winner=A)
    other_winner = make_fight(listing_first=B, listing_second=A, winner=B)
    for fight in (winner_listed_first, loser_listed_first, other_winner):
        assert (fight.fighter_a.source_id, fight.fighter_b.source_id) == (A, B)


def test_order_rule_uses_code_point_order_like_postgres_c_collation() -> None:
    a, b = order_fighters(fighter("Zz9"), fighter("aa1"))
    assert (a.source_id, b.source_id) == ("Zz9", "aa1")  # uppercase sorts before lowercase


def test_same_fighter_twice_is_rejected() -> None:
    with pytest.raises(ValueError, match="two different fighters"):
        order_fighters(fighter(A), fighter(A))


def test_fight_rejects_reversed_fighter_order() -> None:
    with pytest.raises(ValidationError, match="smaller source_id"):
        ParsedFight(source_id="f", card_position=1, fighter_a=fighter(B), fighter_b=fighter(A))


def test_result_needs_winner_iff_win() -> None:
    with pytest.raises(ValidationError):
        ParsedResult(outcome="win", method="KO/TKO", end_round=1, end_time_seconds=10)
    with pytest.raises(ValidationError):
        ParsedResult(
            outcome="draw", winner_source_id=A, method="U-DEC", end_round=3, end_time_seconds=300
        )


def test_round_rejects_landed_above_attempted() -> None:
    with pytest.raises(ValidationError, match="landed exceed attempted"):
        ParsedRound(
            round_number=1, fighter_source_id=A, sig_strikes_landed=5, sig_strikes_attempted=4
        )


def test_complete_fight_has_no_problems() -> None:
    assert make_fight().completeness_problems() == []


def test_fight_without_rounds_or_result_is_incomplete() -> None:
    no_rounds = make_fight(rounds=[])
    assert "no round data" in no_rounds.completeness_problems()
    no_result = ParsedFight(
        source_id="f", card_position=1, fighter_a=fighter(A), fighter_b=fighter(B)
    )
    assert no_result.completeness_problems() == ["no result", "no round data"]


def test_missing_round_is_reported() -> None:
    rounds = [rnd(1, A), rnd(1, B), rnd(3, A), rnd(3, B)]
    problems = make_fight(rounds=rounds).completeness_problems()
    assert "round data does not cover every round" in problems


def test_round_with_one_fighter_missing_is_reported() -> None:
    rounds = [rnd(1, A), rnd(1, B), rnd(2, A), rnd(2, B), rnd(3, A)]
    problems = make_fight(rounds=rounds).completeness_problems()
    assert "a round lacks stats for one fighter" in problems


def test_problem_messages_never_contain_digits() -> None:
    """The expected round range is the finishing round, so messages must not carry numbers."""
    defects = [
        [rnd(1, A), rnd(1, B), rnd(3, A), rnd(3, B)],  # a round missing
        [rnd(1, A), rnd(1, B), rnd(2, A), rnd(2, B), rnd(3, A)],  # a fighter missing in a round
        [rnd(1, "zzz"), rnd(1, B)],  # a stranger's stats
    ]
    for rounds in defects:
        problems = make_fight(rounds=rounds).completeness_problems()
        assert problems
        assert not any(ch.isdigit() for p in problems for ch in p)


def test_slugify() -> None:
    assert slugify("UFC Fight Night: Núñez vs. Smith") == "ufc-fight-night-nunez-vs-smith"
    assert slugify("???") == "untitled"
