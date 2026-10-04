"""Parser tests on real wikitext excerpts (CC BY-SA, see tests/fixtures/wikipedia/README.md)."""

import json
from pathlib import Path

import pytest

from blindcard_ingest.sources.wikipedia.bonuses import BonusAwards, parse_bonus_awards
from blindcard_ingest.sources.wikipedia.markup import clean_wikitext

SECTIONS = json.loads(
    (Path(__file__).parent / "fixtures" / "wikipedia" / "bonus_sections.json").read_text("utf-8")
)


def parsed(title: str) -> BonusAwards:
    awards = parse_bonus_awards(SECTIONS[title])
    assert awards is not None, title
    return awards


def test_clean_wikitext_strips_markup_refs_templates_and_links() -> None:
    raw = (
        "*'''Fight of the Night:''' [[Max Holloway|Max]] vs. [[Dustin Poirier]]"
        "<ref>{{cite web|x=1}}</ref>{{nbsp}}"
    )
    assert clean_wikitext(raw) == "*Fight of the Night: Max vs. Dustin Poirier"


def test_abbreviation_periods_survive_but_a_sentence_period_does_not() -> None:
    awards = parse_bonus_awards(
        "==Bonus awards==\n*'''Performance of the Night: T.J. Brown''' and '''Raúl Rosas Jr.'''\n"
        "*'''Fight of the Night: Max Holloway vs. Justin Gaethje.'''\n"
    )
    assert awards is not None
    assert awards.performers_of_the_night == ("T.J. Brown", "Raúl Rosas Jr.")
    assert awards.fights_of_the_night == (("Max Holloway", "Justin Gaethje"),)


def test_one_fight_of_the_night_and_two_performances() -> None:
    awards = parsed("UFC 300")
    assert awards.fights_of_the_night == (("Max Holloway", "Justin Gaethje"),)
    assert awards.performers_of_the_night == ("Max Holloway", "Jiří Procházka")
    assert awards.is_labeled


def test_the_special_bonus_is_ignored() -> None:
    awards = parsed("UFC 331")
    assert awards.fights_of_the_night == (("Joshua Van", "Alexandre Pantoja"),)
    assert awards.performers_of_the_night == ("Arman Tsarukyan", "Casey O'Neill")


def test_two_fights_of_the_night_on_one_line() -> None:
    awards = parsed("UFC 218")
    assert awards.fights_of_the_night == (
        ("Eddie Alvarez", "Justin Gaethje"),
        ("Yancy Medeiros", "Alex Oliveira"),
    )


def test_a_single_named_fighter_for_fight_of_the_night() -> None:
    awards = parsed("UFC 225")
    assert awards.fights_of_the_night == (("Robert Whittaker",),)  # the note in brackets is dropped


def test_fight_of_the_night_explicitly_not_awarded_still_counts_as_stated() -> None:
    for title in ("UFC 239", "UFC 184"):
        awards = parsed(title)
        assert awards.fights_of_the_night == ()
        assert awards.fotn_stated
        assert awards.is_labeled  # performances are still named


def test_plural_performances_label() -> None:
    assert parsed("UFC 188").performers_of_the_night == ("Patrick Williams", "Fabrício Werdum")


def test_long_performance_list_with_commas_and_and() -> None:
    awards = parsed("UFC 282")
    assert len(awards.performers_of_the_night) == 9
    assert awards.performers_of_the_night[0] == "Santiago Ponzinibbio"
    assert awards.performers_of_the_night[-1] == "Cameron Saaiman"
    assert "Raúl Rosas Jr." in awards.performers_of_the_night


def test_prose_about_a_rescinded_award_is_not_parsed_as_an_award() -> None:
    awards = parsed("UFC Fight Night: Condit vs. Alves")
    assert all("rescinded" not in name.lower() for name in awards.performers_of_the_night)
    assert all(len(group) <= 2 for group in awards.fights_of_the_night)


def test_no_section_returns_none() -> None:
    assert parse_bonus_awards("==Results==\nsome text\n==Background==\nmore") is None


def test_a_section_without_award_lines_is_not_labeled() -> None:
    awards = parse_bonus_awards("==Bonus awards==\nThe bonuses were not announced.\n")
    assert awards is not None
    assert not awards.is_labeled
    assert awards.fights_of_the_night == () and awards.performers_of_the_night == ()


@pytest.mark.parametrize("title", sorted(SECTIONS))
def test_every_fixture_section_parses_without_inventing_awards(title: str) -> None:
    awards = parse_bonus_awards(SECTIONS[title])
    assert awards is not None
    for group in awards.fights_of_the_night:
        assert 1 <= len(group) <= 2
        assert all(name and "'''" not in name and "[[" not in name for name in group)
    assert all(name and "'''" not in name for name in awards.performers_of_the_night)
