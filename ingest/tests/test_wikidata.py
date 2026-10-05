import pytest

from blindcard_ingest.sources.wikidata import country_from_hits


def hit(label: str, description: str) -> dict[str, str]:
    return {"label": label, "description": description}


def test_the_country_is_the_first_nationality_of_the_fighters_description() -> None:
    hits = [hit("Brunno Ferreira", "Brazilian mixed martial artist")]
    assert country_from_hits("Brunno Ferreira", hits) == "br"


def test_accents_and_case_in_the_name_do_not_matter() -> None:
    hits = [hit("Maurício Ruffy", "Brazilian mixed martial artist")]
    assert country_from_hits("Mauricio ruffy", hits) == "br"


def test_other_people_with_the_same_name_are_ignored() -> None:
    hits = [
        hit("Daniel Rodriguez", "Mexican footballer"),
        hit("Daniel Rodriguez", "American mixed martial artist"),
    ]
    assert country_from_hits("Daniel Rodriguez", hits) == "us"


def test_two_fighters_of_different_countries_are_ambiguous() -> None:
    hits = [
        hit("Chris Gutierrez", "American mixed martial artist"),
        hit("Chris Gutierrez", "Mexican mixed martial artist"),
    ]
    assert country_from_hits("Chris Gutierrez", hits) is None


def test_two_fighters_of_the_same_country_are_fine() -> None:
    hits = [
        hit("Chris Gutierrez", "American mixed martial artist"),
        hit("Chris Gutierrez", "American MMA fighter"),
    ]
    assert country_from_hits("Chris Gutierrez", hits) == "us"


@pytest.mark.parametrize(
    "hits",
    [
        [],
        [hit("Someone Else", "Brazilian mixed martial artist")],  # another name
        [hit("Brunno Ferreira", "Brazilian footballer")],  # not a fighter
        [hit("Brunno Ferreira", "mixed martial artist")],  # no country to read: never guess
    ],
)
def test_nothing_clear_gives_no_country(hits: list[dict[str, str]]) -> None:
    assert country_from_hits("Brunno Ferreira", hits) is None
