"""Event listing parser and the (conservative) matching of awards to our fights."""

import datetime as dt
from pathlib import Path

from blindcard_ingest.bonus_matching import (
    FightNames,
    match_event_to_page,
    resolve_awards,
)
from blindcard_ingest.sources.wikipedia.bonuses import (
    FIGHT_OF_THE_NIGHT,
    PERFORMANCE_OF_THE_NIGHT,
    BonusAwards,
)
from blindcard_ingest.sources.wikipedia.events_list import WikiEvent, parse_events_list

LIST_EXCERPT = (
    Path(__file__).parent / "fixtures" / "wikipedia" / "events_list_excerpt.wikitext"
).read_text("utf-8")


def awards(fotn: tuple[tuple[str, ...], ...] = (), potn: tuple[str, ...] = ()) -> BonusAwards:
    return BonusAwards(
        fights_of_the_night=fotn,
        performers_of_the_night=potn,
        fotn_stated=True,
        potn_stated=True,
    )


FIGHTS = [
    FightNames("f1", ("Josh Van", "Alexandre Pantoja")),
    FightNames("f2", ("Arman Tsarukyan", "Mauricio Ruffy")),
    FightNames("f3", ("Casey O'Neill", "Ana Souza")),
    FightNames("f4", ("Jiri Prochazka", "Raul Rosas Jr.")),
]


# --- events list --------------------------------------------------------------------------


def test_events_list_rows_become_events_with_title_display_and_date() -> None:
    events = parse_events_list(LIST_EXCERPT)
    by_title = {e.title: e for e in events}
    assert len(events) == 9
    van = by_title["UFC 331"]
    assert van.display == "UFC 331: Van vs. Pantoja 2"
    assert van.date == dt.date(2026, 9, 19)
    fight_night = by_title["UFC Fight Night: Silva vs. Delgado"]
    assert fight_night.display == fight_night.title  # a link without a pipe
    assert by_title["UFC 182"].date == dt.date(2015, 1, 3)


def test_rows_without_a_date_or_an_event_link_are_skipped() -> None:
    text = (
        "|-\n|[[UFC 1]]\n|no date here\n|-\n|{{dts|2020|Jan|5}}\n|just text\n"
        "|-\n|[[Some Other Page]]\n|{{dts|2020|Jan|5}}\n"
    )
    assert parse_events_list(text) == []


# --- event -> page ------------------------------------------------------------------------

WIKI = [
    WikiEvent("UFC 331", "UFC 331: Van vs. Pantoja 2", dt.date(2026, 9, 19)),
    WikiEvent("UFC Fight Night 100", "UFC Fight Night: Silva vs. Delgado", dt.date(2026, 9, 12)),
    WikiEvent("UFC Fight Night 200", "UFC Fight Night: Lopes vs. Silva", dt.date(2026, 9, 13)),
]


def test_event_matches_the_page_on_the_same_date() -> None:
    page = match_event_to_page("UFC 331: Van vs. Pantoja 2", dt.date(2026, 9, 19), WIKI)
    assert page is not None and page.title == "UFC 331"


def test_a_one_day_difference_is_accepted_when_the_names_agree() -> None:
    page = match_event_to_page("UFC 331: Van vs. Pantoja 2", dt.date(2026, 9, 20), WIKI)
    assert page is not None and page.title == "UFC 331"


def test_a_one_day_difference_with_unrelated_names_is_rejected() -> None:
    assert match_event_to_page("Something Else Entirely", dt.date(2026, 9, 20), WIKI) is None


def test_two_events_on_adjacent_days_prefer_the_exact_date() -> None:
    page = match_event_to_page("UFC Fight Night: Silva vs. Delgado", dt.date(2026, 9, 12), WIKI)
    assert page is not None and page.title == "UFC Fight Night 100"


def test_two_candidates_on_one_date_are_split_by_name_and_ambiguity_is_refused() -> None:
    same_day = [
        WikiEvent("A", "UFC Fight Night: Alpha vs. Beta", dt.date(2020, 1, 1)),
        WikiEvent("B", "UFC Fight Night: Gamma vs. Delta", dt.date(2020, 1, 1)),
    ]
    page = match_event_to_page("UFC Fight Night: Gamma vs. Delta", dt.date(2020, 1, 1), same_day)
    assert page is not None and page.title == "B"
    assert (
        match_event_to_page("UFC Fight Night: Zeta vs. Eta", dt.date(2020, 1, 1), same_day) is None
    )


def test_no_page_near_the_date_means_no_match() -> None:
    assert match_event_to_page("UFC 331", dt.date(2020, 1, 1), WIKI) is None


# --- awards -> fights ---------------------------------------------------------------------


def test_fight_of_the_night_and_performances_resolve_to_fights() -> None:
    result = resolve_awards(
        awards(
            fotn=(("Josh Van", "Alexandre Pantoja"),),
            potn=("Arman Tsarukyan", "Casey O'Neill", "Alexandre Pantoja"),
        ),
        FIGHTS,
    )
    assert result.complete
    assert result.awards_total == 4
    assert result.unresolved == 0
    assert result.bonuses_by_fight == {
        "f1": (FIGHT_OF_THE_NIGHT, PERFORMANCE_OF_THE_NIGHT),  # both labels on one fight
        "f2": (PERFORMANCE_OF_THE_NIGHT,),
        "f3": (PERFORMANCE_OF_THE_NIGHT,),
    }


def test_diacritics_and_generational_suffixes_do_not_block_a_match() -> None:
    result = resolve_awards(awards(potn=("Jiří Procházka", "Raúl Rosas")), FIGHTS)
    assert result.complete
    assert set(result.bonuses_by_fight) == {"f4"}


def test_a_single_named_fighter_resolves_a_fight_of_the_night() -> None:
    result = resolve_awards(awards(fotn=(("Arman Tsarukyan",),)), FIGHTS)
    assert result.bonuses_by_fight == {"f2": (FIGHT_OF_THE_NIGHT,)}


def test_a_close_spelling_is_resolved_when_it_is_unique() -> None:
    result = resolve_awards(awards(potn=("Mauricio Rufy",)), FIGHTS)
    assert result.complete
    assert set(result.bonuses_by_fight) == {"f2"}


def test_an_unknown_name_makes_the_event_incomplete() -> None:
    result = resolve_awards(awards(potn=("Arman Tsarukyan", "Nobody Atall")), FIGHTS)
    assert not result.complete
    assert result.awards_total == 2 and result.unresolved == 1


def test_fight_of_the_night_naming_fighters_of_two_different_fights_is_unresolved() -> None:
    result = resolve_awards(awards(fotn=(("Josh Van", "Arman Tsarukyan"),)), FIGHTS)
    assert not result.complete
    assert result.bonuses_by_fight == {}


def test_a_name_shared_by_two_fighters_is_ambiguous_not_guessed() -> None:
    fights = [
        FightNames("a", ("Bruno Silva", "Opponent One")),
        FightNames("b", ("Bruno Silva", "Opponent Two")),
    ]
    result = resolve_awards(awards(potn=("Bruno Silva",)), fights)
    assert not result.complete and result.unresolved == 1


def test_two_equally_close_candidates_are_not_guessed() -> None:
    fights = [
        FightNames("a", ("Alex Perez", "X One")),
        FightNames("b", ("Alex Peres", "X Two")),
    ]
    # "Alex Perex" is exactly as close to both names: refuse instead of picking one.
    result = resolve_awards(awards(potn=("Alex Perex",)), fights)
    assert not result.complete


def test_no_awards_at_all_is_never_complete() -> None:
    result = resolve_awards(awards(), FIGHTS)
    assert not result.complete
    assert result.awards_total == 0 and result.bonuses_by_fight == {}


# --- name variants seen in real Wikipedia data --------------------------------------------


def _one_fight(*names: str) -> list[FightNames]:
    return [FightNames("f", (names[0], names[1]))]


def test_family_and_given_name_in_another_order_or_split_differently() -> None:
    fights = _one_fight("Song Yadong", "Opponent A") + [
        FightNames("g", ("HyunSung Park", "Opponent B")),
        FightNames("h", ("Batgerel Danaa", "Chan Sung Jung")),
    ]
    result = resolve_awards(
        awards(potn=("Yadong Song", "Park Hyun-sung", "Danaa Batgerel", "Jung Chan-sung")), fights
    )
    assert result.complete
    assert set(result.bonuses_by_fight) == {"f", "g", "h"}


def test_an_extra_given_name_is_accepted_when_the_rest_matches() -> None:
    fights = _one_fight("Diego Ferreira", "Opponent A")
    assert resolve_awards(awards(potn=("Carlos Diego Ferreira",)), fights).complete
    fights = _one_fight("Bruno Silva", "Opponent A")
    assert resolve_awards(awards(potn=("Bruno Gustavo da Silva",)), fights).complete


def test_a_single_shared_token_is_not_a_subset_match() -> None:
    # "Maria" alone is not enough to claim "Maria Souza"; the last-name step has to decide.
    fights = _one_fight("Maria Souza", "Opponent A")
    assert resolve_awards(awards(potn=("Maria",)), fights).complete is False


def test_a_nickname_instead_of_the_given_name_resolves_by_a_unique_last_name() -> None:
    fights = _one_fight("Jacare Souza", "Opponent A") + [FightNames("g", ("Bobby Green", "X Y"))]
    result = resolve_awards(awards(potn=("Ronaldo Souza",)), fights)
    assert result.complete and set(result.bonuses_by_fight) == {"f"}


def test_a_shared_last_name_on_the_card_is_never_guessed() -> None:
    fights = [
        FightNames("a", ("Jacare Souza", "X One")),
        FightNames("b", ("Edimilson Souza", "X Two")),
    ]
    assert not resolve_awards(awards(potn=("Ronaldo Souza",)), fights).complete


def test_unrelated_names_still_do_not_match() -> None:
    fights = _one_fight("Chris Gruetzemacher", "Mike Pierce")
    for name in ("Chris Weidman", "Conor McGregor", "Luke Rockhold"):
        assert not resolve_awards(awards(potn=(name,)), fights).complete


def test_a_fight_of_the_night_pair_resolves_through_the_new_steps() -> None:
    fights = [FightNames("f", ("Song Yadong", "Marlon Vera"))]
    result = resolve_awards(awards(fotn=(("Yadong Song", "Marlon Vera"),)), fights)
    assert result.complete
    assert result.bonuses_by_fight == {"f": (FIGHT_OF_THE_NIGHT,)}
