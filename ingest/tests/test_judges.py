"""Judge statistics from scorecard texts."""

from __future__ import annotations

from fakes import FakeRepository

from blindcard_ingest.judges import (
    MIN_CARDS,
    clean_name,
    compute_judge_stats,
    name_key,
    parse_card,
    slugify,
)
from blindcard_ingest.judges_pipeline import run_ingest_judges


def test_a_card_is_name_first_score_then_second_score_with_the_winner_second() -> None:
    card = parse_card("Ron McCarthy 29 - 28")
    assert card is not None and card.name == "Ron McCarthy"
    assert (
        card.margin == -1
    )  # first number (the loser) is higher: this judge scored against the result
    agreeing = parse_card("Chris Leben 28 - 29")
    assert agreeing is not None and agreeing.margin == 1


def test_notes_glued_to_a_name_are_removed() -> None:
    assert clean_name("Point Deducted: Low Blows by ZhangEric Colon") == "Eric Colon"
    assert clean_name("Technical Decision: Groin Strike to DanhoBen Cartlidge") == "Ben Cartlidge"
    assert clean_name("Sal D'amato") == "Sal D'amato"
    card = parse_card("Point Deducted: Passivity by MaiaMarco Borges 28 - 29")
    assert card is not None and card.name == "Marco Borges"


def test_unreadable_cards_are_not_cards() -> None:
    assert parse_card("not a card") is None
    assert parse_card("Ann Judge 29-") is None


def test_slugs_drop_accents_and_apostrophes_and_names_in_either_order_are_one_judge() -> None:
    assert slugify("Sal D'amato") == "sal-damato"
    assert slugify("José Álvarez") == "jose-alvarez"
    assert name_key("William Mattingly") == name_key("Mattingly William")


def _decision(*cards: str, year: int = 2020) -> tuple[int, list[str]]:
    return (year, list(cards))


def test_dissent_lone_dissent_and_width_are_counted_per_judge() -> None:
    report = compute_judge_stats(
        [
            _decision("Ann One 28 - 29", "Bea Two 28 - 29", "Cid Three 28 - 29"),  # unanimous
            _decision(
                "Ann One 29 - 28", "Bea Two 28 - 29", "Cid Three 28 - 30", year=2022
            ),  # split
        ]
    )
    by = {j.name: j for j in report.judges}
    assert report.decisions == 2
    base = report.baseline
    assert (base.cards, base.dissent) == (6, 1)  # the totals count everyone
    # ... but a judge with a handful of cards is stored by name only: a small count says too much.
    ann = by["Ann One"]
    assert (ann.cards, ann.dissent, ann.lone_dissent, ann.abs_sum, ann.first_year) == (
        0,
        0,
        0,
        0,
        0,
    )


def test_a_judge_with_enough_cards_keeps_every_number() -> None:
    texts = [
        _decision("Ann One 29 - 28", "Bea Two 28 - 29", "Cid Three 28 - 30", year=2020 + i % 3)
        for i in range(MIN_CARDS)
    ]
    report = compute_judge_stats(texts)
    by = {j.name: j for j in report.judges}
    ann = by["Ann One"]
    assert (ann.cards, ann.dissent, ann.lone_dissent) == (MIN_CARDS, MIN_CARDS, MIN_CARDS)
    assert (ann.abs_sum, ann.abs_sumsq) == (MIN_CARDS, MIN_CARDS)
    assert (ann.first_year, ann.last_year) == (2020, 2022)
    assert by["Cid Three"].abs_sum == 2 * MIN_CARDS


def test_two_dissenters_are_not_a_lone_dissent() -> None:
    report = compute_judge_stats(
        [_decision("Ann One 29 - 28", "Bea Two 29 - 28", "Cid Three 28 - 29")]
    )
    assert {j.name: j.lone_dissent for j in report.judges} == {
        "Ann One": 0,
        "Bea Two": 0,
        "Cid Three": 0,
    }


def test_reversed_names_merge_and_incomplete_decisions_are_skipped() -> None:
    report = compute_judge_stats(
        [
            _decision("William Mattingly 28 - 29", "Bea Two 28 - 29", "Cid Three 28 - 29"),
            _decision("Mattingly William 28 - 29", "Bea Two 28 - 29", "Cid Three 28 - 29"),
            _decision("Ann One 28 - 29", "Bea Two 28 - 29"),  # two cards: skipped
            _decision("Ann One 28 - 29", "garbage", "Cid Three 28 - 29"),  # unreadable: skipped
        ]
    )
    names = {j.name: j for j in report.judges}
    merged = names["William Mattingly"]
    assert merged.slugs == ["mattingly-william", "william-mattingly"]  # both spellings link here
    assert report.decisions == 2 and report.skipped == 2


def test_only_aggregates_are_stored_and_judges_with_enough_cards_are_counted() -> None:
    cards = [
        _decision("Ann One 28 - 29", "Bea Two 28 - 29", "Cid Three 28 - 29")
        for _ in range(MIN_CARDS)
    ]
    repo = FakeRepository(scorecards=cards)
    report = run_ingest_judges(repo)
    assert repo.judge_report is report
    assert report.baseline.judges_with_enough == 3
    assert report.baseline.cards == 3 * MIN_CARDS
    dry = FakeRepository(scorecards=cards)
    run_ingest_judges(dry, dry_run=True)
    assert dry.judge_report is None


def test_a_note_stuck_to_a_known_name_is_merged_into_that_judge() -> None:
    plain = [
        _decision("Eric Colon 28 - 29", "Bea Two 28 - 29", "Cid Three 28 - 29") for _ in range(10)
    ]
    glued = _decision("Eye PokeEric Colon 28 - 29", "Bea Two 28 - 29", "Cid Three 28 - 29")
    report = compute_judge_stats([*plain, glued])
    names = {j.name: j.cards for j in report.judges}
    assert names["Eric Colon"] == 0  # 11 cards, below the minimum: stored by name only
    assert "Eye PokeEric Colon" not in names
    assert report.baseline.cards == 33  # but all of them are in the totals
