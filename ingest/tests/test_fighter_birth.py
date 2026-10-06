import datetime as dt

from blindcard_ingest.sources.wikipedia.fighter_birth import parse_birth_date

D = dt.date(1990, 2, 13)


def test_the_common_spellings_of_the_infobox_template() -> None:
    for text in (
        "| birth_date      = {{Birth date and age|1990|2|13}}",
        "| birth_date = {{birth date and age|1990|02|13|df=y}}",
        "| birth_date = {{Birth date and age|df=y|1990|2|13}}",
        "| birth_date = {{Birth date|1990|2|13}}",
        "| birth_date = {{bda|1990|2|13}}",
    ):
        assert parse_birth_date(text) == D, text


def test_anything_else_is_left_alone_never_guessed() -> None:
    for text in (
        "",
        "| birth_date = 13 February 1990",  # written out: not read
        "| birth_date = {{Birth date and age|1990|2}}",  # no day
        "| birth_date = {{Birth date and age|1990|13|2}}",  # no month 13
        "| birth_date = {{Birth date and age|1890|2|13}}",  # a century off
        "| death_date = {{Birth date and age|1990|2|13}}",  # not the birth parameter
        "{{Birth date and age|1990|2|13}}",  # outside the infobox parameter
    ):
        assert parse_birth_date(text) is None, text
