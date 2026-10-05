"""Fighting style from a Wikipedia infobox: a fixed list of labels, never noise."""

from __future__ import annotations

from fakes import FakeRepository
from test_upcoming import TODAY, FakeWiki

from blindcard_ingest.sources.wikipedia.fighter_style import is_mma_fighter_page, parse_styles
from blindcard_ingest.upcoming import parse_upcoming_card
from blindcard_ingest.upcoming_pipeline import run_ingest_upcoming


def page(infobox_style: str, *, rank: str = "") -> str:
    return (
        "{{Infobox martial artist\n|name=Test Fighter\n"
        f"|style={infobox_style}\n|stance=Orthodox\n|rank={rank}\n"
        "}}\n'''Test Fighter''' is a professional [[mixed martial arts]] fighter.\n"
    )


def test_labels_come_from_a_fixed_list_in_the_pages_order() -> None:
    assert parse_styles(page("[[Kickboxing]], [[Brazilian jiu-jitsu]]")) == [
        "Kickboxing",
        "Brazilian jiu-jitsu",
    ]
    assert parse_styles(page("[[Muay Thai]] / [[Wrestling]] and [[Judo]]")) == [
        "Muay Thai",
        "Wrestling",
        "Judo",
    ]
    assert parse_styles(page("Submission wrestling, boxing, freestyle wrestling")) == [
        "Grappling",
        "Boxing",
        "Wrestling",
    ]


def test_kickboxing_is_not_boxing_and_there_are_never_more_than_three() -> None:
    assert parse_styles(page("Kickboxing")) == ["Kickboxing"]
    assert parse_styles(page("Boxing, Kickboxing, Karate, Judo, Sambo")) == [
        "Boxing",
        "Kickboxing",
        "Karate",
    ]
    assert parse_styles(page("Dutch kickboxing, Kickboxing")) == ["Kickboxing"]


def test_a_stance_or_a_hometown_gives_nothing() -> None:
    assert parse_styles(page("")) == []
    assert parse_styles(page("Orthodox")) == []
    assert (
        parse_styles(
            "{{Infobox martial artist\n|name=X\n|stance=Southpaw\n|fighting_out_of=London\n}}"
        )
        == []
    )
    assert parse_styles("no infobox at all") == []
    # "Mixed martial arts" says nothing
    assert parse_styles("{{Infobox martial artist\n|style=Mixed Martial Arts\n}}") == []


def test_an_empty_style_falls_back_on_the_belts_named_in_rank() -> None:
    assert parse_styles(page("", rank="Purple belt in [[Brazilian jiu-jitsu]]")) == [
        "Brazilian jiu-jitsu"
    ]
    assert parse_styles(page("", rank="Black belt in [[Luta Livre]]")) == ["Luta Livre"]
    assert parse_styles(
        page("", rank="Brown belt in [[Brazilian jiu-jitsu]] under John Smith")
    ) == ["Brazilian jiu-jitsu"]


def test_belts_come_after_the_style_in_the_order_named_and_never_beyond_three() -> None:
    box = page(
        "Muay Thai",
        rank="Black belt in [[Judo]]; brown belt in [[Brazilian jiu-jitsu]], black in karate",
    )
    assert parse_styles(box) == ["Muay Thai", "Judo", "Brazilian jiu-jitsu"]
    # a style already named is not repeated from the belts
    assert parse_styles(page("Judo", rank="Black belt in Judo")) == ["Judo"]


def test_only_the_page_of_an_mma_fighter_counts() -> None:
    assert is_mma_fighter_page(page("Judo"))
    boxer = page("Boxing").replace("mixed martial arts", "boxing")
    assert not is_mma_fighter_page(boxer)
    assert not is_mma_fighter_page("Michael Johnson may refer to a footballer or an MMA fighter")


def test_the_card_says_which_article_a_name_links_to() -> None:
    text = """
{{MMAevent card|Main Card}}
{{MMAevent bout
|Middleweight
|[[Brendan Allen]]
|vs.
|[[Christian Leroy Duncan|Leroy Duncan]]
|
|
|
|
}}
{{MMAevent bout
|Lightweight
|Plain Name
|vs.
|[[File:x.jpg]] Some Name
|
|
|
|
}}
"""
    card = parse_upcoming_card(text)
    assert card is not None
    first, second = card.bouts
    assert (first.a_page, first.b_page) == ("Brendan Allen", "Christian Leroy Duncan")
    assert second.a_page is None  # no link, no page: nothing is guessed
    assert second.b_page is None  # a file is not an article


CARD = """
{{MMAevent card|Main Card}}
{{MMAevent bout
|Middleweight
|[[Brendan Allen]]
|vs.
|[[Christian Leroy Duncan]]
|
|
|
|
}}
{{MMAevent bout
|Lightweight
|Francisco Prado
|vs.
|[[Ismael Bonfim]]
|
|
|
|
}}
"""


class StyleWiki(FakeWiki):
    fighter_pages: dict[str, str]

    def page_wikitexts(self, titles, *, batch_size=50, max_age_seconds=None):  # type: ignore[no-untyped-def]
        if any(t in self.pages for t in titles):
            return super().page_wikitexts(
                titles, batch_size=batch_size, max_age_seconds=max_age_seconds
            )
        self.calls.append(list(titles))
        return {t: self.fighter_pages[t] for t in titles if t in self.fighter_pages}


def test_the_pipeline_attaches_styles_by_page_and_leaves_unlinked_or_unclear_fighters_empty() -> (
    None
):
    wiki = StyleWiki({"UFC Fight Night: Allen vs. Duncan": CARD, "UFC 333": "==Background=="})
    wiki.fighter_pages = {
        "Brendan Allen": page("[[Brazilian jiu-jitsu]], [[Wrestling]]"),
        "Christian Leroy Duncan": page("[[Kickboxing]]"),
        "Ismael Bonfim": "{{Infobox person|name=Someone Else}} a footballer",  # not an MMA fighter
    }
    repo = FakeRepository()
    report = run_ingest_upcoming(wiki, repo, today=TODAY)
    event = next(e for e in repo.upcoming if e.name.endswith("Allen vs. Duncan"))
    main, second = event.bouts
    assert main.a_style == ("Brazilian jiu-jitsu", "Wrestling")
    assert main.b_style == ("Kickboxing",)
    assert second.a_style == () and second.b_style == ()
    assert report.styles_found == 2
