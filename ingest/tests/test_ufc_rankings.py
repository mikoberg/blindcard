"""The UFC rankings article, in each of the layouts it has had."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from blindcard_ingest.sources.wikipedia.ufc_rankings import (
    CHAMPION,
    Ranked,
    division_of,
    normalise,
    parse_rankings,
    rank_lookup,
)

LAYOUTS = json.loads(
    (Path(__file__).parent / "fixtures" / "wikipedia" / "ufc_rankings_layouts.json").read_text(
        encoding="utf-8"
    )
)


def lightweight(layout: str) -> dict[int, str]:
    return {r.rank: r.name for r in parse_rankings(LAYOUTS[layout]) if r.division == "Lightweight"}


@pytest.mark.parametrize(
    ("layout", "champion", "first", "second"),
    [
        ("2018", "Khabib Nurmagomedov", "Conor McGregor", "Tony Ferguson"),
        ("2021", "Charles Oliveira", "Dustin Poirier", "Justin Gaethje"),
        ("2024", "Islam Makhachev", "Arman Tsarukyan", "Charles Oliveira"),
        ("current", "Justin Gaethje", "Ilia Topuria", "Arman Tsarukyan"),
    ],
)
def test_every_layout_gives_the_champion_and_the_first_places(
    layout: str, champion: str, first: str, second: str
) -> None:
    places = lightweight(layout)
    assert places[CHAMPION] == champion
    assert places[1] == first
    assert places[2] == second


def test_the_current_layout_reads_women_and_keeps_the_first_system_only() -> None:
    ranked = parse_rankings(LAYOUTS["current"])
    divisions = {r.division for r in ranked}
    assert "Women's Strawweight" in divisions and "Lightweight" in divisions
    # the media ranking further down repeats the division: its "Someone Else" must not appear
    assert "Someone Else" not in {r.name for r in ranked}


def test_a_champion_is_listed_once_even_when_the_table_names_them_twice() -> None:
    names = [r.name for r in parse_rankings(LAYOUTS["2021"]) if r.division == "Lightweight"]
    assert len(names) == len(set(names))


def test_pound_for_pound_and_other_non_divisions_are_skipped() -> None:
    text = '== Men\'s pound for pound ==\n{| class="wikitable"\n|-\n! 1\n| [[Some One]]\n|}\n'
    assert parse_rankings(text) == []
    for heading in ("Pound-for-Pound rankings", "Catch Weight", "Open weight"):
        assert division_of(heading) is None


@pytest.mark.parametrize(
    ("heading", "division"),
    [
        ("Lightweight", "Lightweight"),
        ("Light Heavyweight", "Light Heavyweight"),
        ("Heavyweight", "Heavyweight"),
        ("[[Lightweight (MMA)|Lightweight]] (146 to 155 lb; 66 to 70 kg)", "Lightweight"),
        ("Women's [[Strawweight (MMA)|Strawweight]] (106 to 115 lb)", "Women's Strawweight"),
        ("Women's Bantamweight", "Women's Bantamweight"),
    ],
)
def test_headings_in_every_style_name_their_division(heading: str, division: str) -> None:
    assert division_of(heading) == division


def test_names_are_compared_without_accents_or_punctuation() -> None:
    assert normalise("Maurício Ruffy") == normalise("Mauricio Ruffy")
    assert normalise("Jiří Procházka") == normalise("Jiri Prochazka")
    assert normalise("Abdul-Rakhman  Yakhyaev") == "abdul rakhman yakhyaev"


def test_the_lookup_is_by_division_and_name() -> None:
    lookup = rank_lookup(
        [
            Ranked("Lightweight", 3, "Charles Oliveira"),
            Ranked("Welterweight", 9, "Charles Oliveira"),
        ]
    )
    assert lookup[("Lightweight", normalise("Charles Oliveira"))] == 3
    assert lookup[("Welterweight", normalise("Charles Oliveira"))] == 9


def test_the_2019_layout_names_its_divisions_in_the_table_caption() -> None:
    ranked = parse_rankings(LAYOUTS["2019"])
    by = {(r.division, r.name): r.rank for r in ranked}
    assert by[("Heavyweight", "Daniel Cormier")] == 0
    assert by[("Heavyweight", "Stipe Miocic")] == 1
    assert (
        by[("Heavyweight", "Alexander Volkov")] == by[("Heavyweight", "Alistair Overeem")] == 6
    )  # a tie
    assert by[("Lightweight", "Khabib Nurmagomedov")] == 0
    assert by[("Lightweight", "Tony Ferguson")] == 2
    assert by[("Women's Strawweight", "Zhang Weili")] == 0
    assert by[("Women's Strawweight", "Joanna Jędrzejczyk")] == 1
    assert ("Heavyweight", "Tony Ferguson") not in by  # a division never takes the next one's rows


def test_a_caption_that_names_no_division_does_not_cut_a_headed_section_in_two() -> None:
    text = """== Lightweight ==
{| class="wikitable"
|+
'''Champion: {{flagicon|RUS}} [[Khabib Nurmagomedov]] [28-0]'''
!Rank
!Fighter
|-
| align="center" |1
|{{flagicon|USA}} [[Tony Ferguson]]
|-
| align="center" |2
|{{flagicon|USA}} [[Dustin Poirier]]
|}
== Featherweight ==
{| class="wikitable"
|-
| align="center" |1
|{{flagicon|USA}} [[Zabit Magomedsharipov]]
|}
"""
    by = {(r.division, r.name): r.rank for r in parse_rankings(text)}
    assert by[("Lightweight", "Khabib Nurmagomedov")] == 0
    assert by[("Lightweight", "Tony Ferguson")] == 1 and by[("Lightweight", "Dustin Poirier")] == 2
    assert by[("Featherweight", "Zabit Magomedsharipov")] == 1
