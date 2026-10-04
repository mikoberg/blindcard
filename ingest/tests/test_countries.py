import pytest

from blindcard_ingest.sources.wikipedia.countries import country_code


def box(**fields: str) -> str:
    body = "\n".join(f"| {k} = {v}" for k, v in fields.items())
    return "{{Infobox martial artist\n| name = X\n" + body + "\n}}\nText."


@pytest.mark.parametrize(
    ("fields", "code"),
    [
        ({"nationality": "Brazilian"}, "br"),
        ({"nationality": "Armenian <br> Russian<ref name=a>{{cite web|url=x}}</ref>"}, "am"),
        ({"nationality": "", "birth_place": "[[Coruripe]], [[Alagoas]], Brazil<ref>x</ref>"}, "br"),
        ({"birth_place": "[[Arboga]], Sweden"}, "se"),
        ({"birth_place": "[[Rochester, New York]], U.S."}, "us"),
        ({"birth_place": "Houston, Texas"}, "us"),
        ({"birth_place": "[[Cork (city)|Cork]], Ireland"}, "ie"),
        ({"nationality": "Scottish"}, "gb-sct"),
        ({"nationality": "English"}, "gb-eng"),
        ({"nationality": "South Korean"}, "kr"),
        ({"nationality": "New Zealander"}, "nz"),
        ({"nationality": "American"}, "us"),
        ({"nationality": "Irish and British"}, "ie"),
    ],
)
def test_country_codes(fields: dict[str, str], code: str) -> None:
    assert country_code(box(**fields)) == code


@pytest.mark.parametrize(
    "fields",
    [
        {},
        {"nationality": "Stateless"},
        {"birth_place": "Somewhere unknown"},
        {"nationality": "", "birth_place": "[[Springfield]]"},
    ],
)
def test_an_unclear_country_is_none_never_a_guess(fields: dict[str, str]) -> None:
    assert country_code(box(**fields)) is None


def test_a_page_without_an_infobox_has_no_country() -> None:
    assert country_code("Just text, born in Brazil.") is None


def test_the_real_pages_give_the_right_country() -> None:
    import json
    import os
    from pathlib import Path

    path = Path(os.environ.get("TEMP", "")) / "fighters.json"
    if not path.exists():
        pytest.skip("scratch pages not available")
    pages = json.loads(path.read_text(encoding="utf-8"))
    assert country_code(pages["Alexander Gustafsson"]) == "se"
    assert country_code(pages["Arman Tsarukyan"]) == "am"
    assert country_code(pages["Jon Jones"]) == "us"
    assert country_code(pages["Mauricio Ruffy"]) == "br"


@pytest.mark.parametrize(
    ("text", "code"),
    [
        ("{{short description|Georgian-American mixed martial artist (born 1988)}}", "ge"),
        ("{{Short description|Russian mixed martial artist (born 1991)}}", "ru"),
        ("{{short description|Kyrgyz mixed martial artist (born 1988)}}", "kg"),
        ("{{short description|South Korean mixed martial artist}}", "kr"),
        ("{{short description|New Zealander mixed martial artist}}", "nz"),
        ("{{short description|Canadian mixed martial arts fighter}}", "ca"),
        ("{{short description|Swedish mixed martial artist}}", "se"),
    ],
)
def test_the_short_description_gives_the_first_nationality(text: str, code: str) -> None:
    assert country_code(text + "\n{{Infobox martial artist\n| name = X\n}}") == code


def test_the_short_description_wins_over_a_birth_place_that_is_a_former_country() -> None:
    page = (
        "{{short description|Russian mixed martial artist}}\n{{Infobox martial artist\n"
        "| birth_place = [[Makhachkala]], [[Dagestan ASSR]], Soviet Union\n}}"
    )
    assert country_code(page) == "ru"


def test_list_templates_and_citizenship_are_read_as_fallbacks() -> None:
    assert country_code(box(nationality="{{hlist|Canada|Latvia}}")) == "ca"
    assert country_code(box(citizenship="Kyrgyzstan <br /> Russia")) == "kg"
    assert country_code(box(citizenship="{{ubl|Georgia|United States}}")) == "ge"
