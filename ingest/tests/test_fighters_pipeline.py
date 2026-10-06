import datetime as dt
from collections.abc import Sequence

from fakes import FakeRepository
from helpers import make_fight

from blindcard_ingest import cli
from blindcard_ingest.fighters_pipeline import run_ingest_fighters
from blindcard_ingest.models import (
    EventBundle,
    ParsedEvent,
    ParsedFight,
    ParsedFighter,
    order_fighters,
)
from blindcard_ingest.sources.sherdog import SherdogBout, SherdogPage

SOURCE = "fakesource"
DAY1, DAY2 = dt.date(2019, 3, 2), dt.date(2021, 5, 8)


def fighter(name: str) -> ParsedFighter:
    return ParsedFighter(source_id=f"id-{name.lower().replace(' ', '-')}", name=name)


def bout(fight_id: str, a: str, b: str) -> ParsedFight:
    first, second = order_fighters(fighter(a), fighter(b))
    base = make_fight(source_id=fight_id)
    return base.model_copy(update={"fighter_a": first, "fighter_b": second})


def bundle(event_id: str, day: dt.date, fights: list[ParsedFight]) -> EventBundle:
    return EventBundle(
        event=ParsedEvent(source_id=event_id, name=f"Event {event_id}", event_date=day),
        fights=fights,
    )


def page(country: str, rows: list[tuple[str, str, dt.date, str]]) -> str:
    """A fighter page: rows are (result, record after, date, opponent), newest first."""
    body = "\n".join(
        f"|-\n|{{{{yes2}}}}{res}\n|align=center|{rec}\n|{opp}\n|KO\n|[[Show]]\n"
        f"|{{{{dts|{d.year}|{d.strftime('%B')}|{d.day}}}}}\n|1\n|0:30\n|Place\n|"
        for res, rec, d, opp in rows
    )
    return (
        f"{{{{Infobox martial artist\n| nationality = {country}\n}}}}\n"
        f"== Mixed martial arts record ==\n{{{{MMA record start}}}}\n{body}\n{{{{end}}}}\n"
    )


class FakeWiki:
    def __init__(self, pages: dict[str, str], search: dict[str, list[str]] | None = None) -> None:
        self._pages = pages
        self._search = search or {}
        self.searched: list[str] = []
        self.asked: list[list[str]] = []
        self.batch_sizes: list[int] = []

    def search_titles(self, query: str, *, limit: int = 3) -> list[str]:
        self.searched.append(query)
        return list(self._search.get(query, []))[:limit]

    def page_wikitexts(self, titles: Sequence[str], *, batch_size: int) -> dict[str, str]:
        self.asked.append(list(titles))
        self.batch_sizes.append(batch_size)
        return {t: self._pages[t] for t in titles if t in self._pages}


def setup() -> tuple[FakeRepository, FakeWiki]:
    repo = FakeRepository()
    repo.upsert_event_bundle(SOURCE, "UFC", bundle("e1", DAY1, [bout("f1", "Ann One", "Bea Two")]))
    repo.upsert_event_bundle(
        SOURCE, "UFC", bundle("e2", DAY2, [bout("f2", "Ann One", "Cat Three")])
    )
    wiki = FakeWiki(
        {
            "Ann One": page(
                "Brazilian",
                [
                    ("Win", "6-1", DAY2, "Cat Three"),
                    ("Win", "5-1", DAY1, "Bea Two"),
                    ("Loss", "4-1", dt.date(2018, 1, 1), "Old Rival"),
                ],
            ),
            "Bea Two": page(
                "Swedish",
                [("Loss", "2-2", DAY1, "Ann One"), ("Win", "2-1", dt.date(2018, 5, 5), "X Y")],
            ),
        }
    )
    return repo, wiki


def test_records_before_each_bout_and_countries_are_stored() -> None:
    repo, wiki = setup()
    report = run_ingest_fighters(wiki, repo, source_name=SOURCE, from_year=2015)

    assert repo.countries == {"id-ann-one": "br", "id-bea-two": "se"}
    # Ann before f1 (Mar 2019): the row before it, 4-1. Before f2: after f1's row, 5-1.
    f1 = repo.records["f1"]
    f2 = repo.records["f2"]
    side_of = {
        "id-ann-one": "a" if "id-ann-one" < "id-bea-two" else "b",
        "id-bea-two": "b" if "id-ann-one" < "id-bea-two" else "a",
    }
    assert f1[side_of["id-ann-one"]] == {"w": 4, "l": 1, "d": 0, "nc": 0}
    assert f1[side_of["id-bea-two"]] == {"w": 2, "l": 1, "d": 0, "nc": 0}
    assert list(f2.values()) == [{"w": 5, "l": 1, "d": 0, "nc": 0}]  # Cat has no page
    assert report.fighters == 3 and report.fighters_resolved == 2


def test_the_record_after_a_bout_is_never_stored() -> None:
    repo, wiki = setup()
    run_ingest_fighters(wiki, repo, source_name=SOURCE, from_year=2015)
    stored = [rec for payload in repo.records.values() for rec in payload.values()]
    assert {"w": 5, "l": 1, "d": 0, "nc": 0} in stored  # before f2
    assert {"w": 6, "l": 1, "d": 0, "nc": 0} not in stored  # the record after f2 (a win)
    assert {"w": 2, "l": 2, "d": 0, "nc": 0} not in stored  # Bea's record after f1


def test_a_page_that_is_not_the_fighters_is_not_used() -> None:
    repo, _ = setup()
    wrong = FakeWiki(
        {"Ann One": page("Chinese", [("Win", "9-0", dt.date(2010, 1, 1), "Somebody")])}
    )
    run_ingest_fighters(wrong, repo, source_name=SOURCE, from_year=2015)
    assert repo.countries == {} and repo.records == {}


def test_the_disambiguated_title_is_the_second_try() -> None:
    repo, wiki = setup()
    pages = dict(wiki._pages)
    pages["Bea Two (fighter)"] = pages.pop("Bea Two")
    pages["Bea Two"] = "{{Infobox person}} some other Bea Two"
    second = FakeWiki(pages)
    run_ingest_fighters(second, repo, source_name=SOURCE, from_year=2015)
    assert repo.countries["id-bea-two"] == "se"
    assert any("Bea Two (fighter)" in titles for titles in second.asked)
    assert all("Ann One (fighter)" not in titles for titles in second.asked)  # already resolved


def test_long_pages_are_fetched_in_small_batches() -> None:
    repo, wiki = setup()
    run_ingest_fighters(wiki, repo, source_name=SOURCE, from_year=2015, batch_size=7)
    assert set(wiki.batch_sizes) == {7}


def test_a_dry_run_stores_nothing_and_a_rerun_changes_nothing() -> None:
    repo, wiki = setup()
    run_ingest_fighters(wiki, repo, source_name=SOURCE, from_year=2015, dry_run=True)
    assert repo.records == {} and repo.countries == {}
    run_ingest_fighters(wiki, repo, source_name=SOURCE, from_year=2015)
    snapshot = (dict(repo.records), dict(repo.countries))
    run_ingest_fighters(wiki, repo, source_name=SOURCE, from_year=2015)
    assert (repo.records, repo.countries) == snapshot


def test_only_counts_are_logged(caplog) -> None:  # type: ignore[no-untyped-def]
    repo, wiki = setup()
    with caplog.at_level("INFO"):
        run_ingest_fighters(wiki, repo, source_name=SOURCE, from_year=2015)
    logged = " ".join(r.getMessage() for r in caplog.records)
    assert "Ann One" not in logged and "Bea Two" not in logged


def test_the_cli_knows_ingest_fighters() -> None:
    args = cli.build_parser().parse_args(["ingest-fighters", "--from", "2010"])
    assert (args.command, args.from_year) == ("ingest-fighters", 2010)


def test_a_page_with_accents_in_its_title_is_found_by_search() -> None:
    """Our source drops accents: "Bea Two" is "Béa Two" on Wikipedia."""
    repo, wiki = setup()
    pages = dict(wiki._pages)
    pages["Béa Two"] = pages.pop("Bea Two")
    found = FakeWiki(pages, search={"Bea Two mixed martial artist": ["Béa Two", "Other Bea"]})
    run_ingest_fighters(found, repo, source_name=SOURCE, from_year=2015)
    assert repo.countries["id-bea-two"] == "se"
    assert "Bea Two mixed martial artist" in found.searched
    assert "Ann One mixed martial artist" not in found.searched  # already found by name


def test_a_search_hit_that_is_not_the_fighter_is_ignored() -> None:
    repo, wiki = setup()
    pages = dict(wiki._pages)
    pages.pop("Bea Two")
    pages["Somebody Else"] = page("Chinese", [("Win", "9-0", dt.date(2010, 1, 1), "Somebody")])
    found = FakeWiki(pages, search={"Bea Two mixed martial artist": ["Somebody Else"]})
    run_ingest_fighters(found, repo, source_name=SOURCE, from_year=2015)
    assert "id-bea-two" not in repo.countries


class FakeCountries:
    def __init__(self, mapping: dict[str, str]) -> None:
        self._mapping = mapping
        self.asked: list[str] = []

    def country_for_fighter(self, name: str) -> str | None:
        self.asked.append(name)
        return self._mapping.get(name)


def test_wikidata_gives_a_country_to_fighters_without_a_page() -> None:
    repo, wiki = setup()
    countries = FakeCountries({"Cat Three": "pl"})
    run_ingest_fighters(wiki, repo, source_name=SOURCE, from_year=2015, countries_source=countries)
    assert repo.countries["id-cat-three"] == "pl"
    assert repo.countries["id-ann-one"] == "br"  # from the page: not overridden
    assert set(countries.asked) == {"Cat Three"}  # only the fighter still without a country


class FakeSherdog:
    def __init__(self, pages: dict[str, list[SherdogPage]]) -> None:
        self._pages = pages
        self.asked: list[str] = []

    def pages_for(self, name: str) -> list[SherdogPage]:
        self.asked.append(name)
        return self._pages.get(name, [])


def sherdog_page(country: str | None, bouts: list[tuple[dt.date, str, str]]) -> SherdogPage:
    return SherdogPage(
        url="/fighter/x",
        country=country,
        bouts=tuple(SherdogBout(d, opp, res) for d, opp, res in bouts),
    )


def test_sherdog_gives_records_and_country_to_fighters_without_a_wikipedia_page() -> None:
    repo, wiki = setup()
    # Cat Three has no Wikipedia page; Sherdog knows two earlier wins before the bout on DAY2.
    sherdog = FakeSherdog(
        {
            "Cat Three": [
                sherdog_page(
                    "pl",
                    [
                        (DAY2, "Ann One", "loss"),
                        (dt.date(2020, 1, 1), "A", "win"),
                        (dt.date(2019, 1, 1), "B", "win"),
                    ],
                )
            ]
        }
    )
    run_ingest_fighters(wiki, repo, source_name=SOURCE, from_year=2015, sherdog=sherdog)
    assert repo.countries["id-cat-three"] == "pl"
    f2 = repo.records["f2"]
    cat_side = "b" if "id-ann-one" < "id-cat-three" else "a"
    assert f2[cat_side] == {"w": 2, "l": 0, "d": 0, "nc": 0}  # the bout's own loss is not counted
    assert "Ann One" not in sherdog.asked  # found on Wikipedia already


def test_a_sherdog_page_of_someone_else_is_ignored() -> None:
    repo, wiki = setup()
    sherdog = FakeSherdog(
        {"Cat Three": [sherdog_page("pl", [(dt.date(2010, 1, 1), "Nobody", "win")])]}
    )
    run_ingest_fighters(wiki, repo, source_name=SOURCE, from_year=2015, sherdog=sherdog)
    assert "id-cat-three" not in repo.countries


def test_only_missing_asks_for_fighters_that_have_no_record_yet() -> None:
    repo, wiki = setup()
    run_ingest_fighters(wiki, repo, source_name=SOURCE, from_year=2015)  # Cat still has none
    sherdog = FakeSherdog({})
    run_ingest_fighters(
        wiki,
        repo,
        source_name=SOURCE,
        from_year=2015,
        sherdog=sherdog,
        only_missing=True,
        use_wikipedia=False,
    )
    assert sherdog.asked == ["Cat Three"]


def test_a_new_record_for_one_side_never_erases_the_other_sides_record() -> None:
    repo, wiki = setup()
    run_ingest_fighters(wiki, repo, source_name=SOURCE, from_year=2015)
    ann_side = "a" if "id-ann-one" < "id-cat-three" else "b"
    cat_side = "b" if ann_side == "a" else "a"
    before = dict(repo.records["f2"])
    assert set(before) == {ann_side}  # Ann has her record, Cat has none yet

    sherdog = FakeSherdog(
        {
            "Cat Three": [
                sherdog_page("pl", [(DAY2, "Ann One", "loss"), (dt.date(2019, 1, 1), "B", "win")])
            ]
        }
    )
    run_ingest_fighters(
        wiki, repo, source_name=SOURCE, from_year=2015, sherdog=sherdog, only_missing=True
    )
    assert repo.records["f2"][ann_side] == before[ann_side]  # still there
    assert repo.records["f2"][cat_side] == {"w": 1, "l": 0, "d": 0, "nc": 0}


def test_only_missing_looks_up_a_fighters_missing_bouts_even_if_other_bouts_have_a_record() -> None:
    repo, wiki = setup()
    run_ingest_fighters(wiki, repo, source_name=SOURCE, from_year=2015)
    # Wipe Ann's record for f2 only: she still has one for f1, so she is not "without records".
    ann_side = "a" if "id-ann-one" < "id-cat-three" else "b"
    repo.records["f2"].pop(ann_side)
    sherdog = FakeSherdog(
        {"Ann One": [sherdog_page("br", [(DAY2, "Cat Three", "win"), (DAY1, "Bea Two", "win")])]}
    )
    run_ingest_fighters(
        wiki,
        repo,
        source_name=SOURCE,
        from_year=2015,
        sherdog=sherdog,
        only_missing=True,
        use_wikipedia=False,
    )
    assert repo.records["f2"][ann_side] == {"w": 1, "l": 0, "d": 0, "nc": 0}


def test_a_fighter_found_on_sherdog_also_gets_the_rest_of_the_career() -> None:
    repo, wiki = setup()
    bouts = [
        (DAY2, "Ann One", "loss"),
        (dt.date(2020, 1, 1), "A", "win"),
        (dt.date(2019, 1, 1), "B", "win"),
    ]
    sherdog = FakeSherdog({"Cat Three": [sherdog_page("pl", bouts)]})
    run_ingest_fighters(wiki, repo, source_name=SOURCE, from_year=2015, sherdog=sherdog)
    career = repo.fighter_bouts["id-cat-three"]
    assert [(r.date, r.opponent) for r in career] == [
        (dt.date(2019, 1, 1), "B"),
        (dt.date(2020, 1, 1), "A"),
    ]  # the bout we store ourselves is not repeated


def test_the_date_of_birth_of_a_fighter_with_a_wikipedia_page_is_stored() -> None:
    repo, wiki = setup()
    wiki._pages["Ann One"] = wiki._pages["Ann One"].replace(
        "| nationality = Brazilian\n",
        "| nationality = Brazilian\n| birth_date = {{Birth date and age|1990|2|13}}\n",
    )
    run_ingest_fighters(wiki, repo, source_name=SOURCE, from_year=2015)
    assert repo.birth_dates == {"id-ann-one": dt.date(1990, 2, 13)}  # only the fighter who has one


def test_a_dry_run_stores_no_birth_dates() -> None:
    repo, wiki = setup()
    run_ingest_fighters(wiki, repo, source_name=SOURCE, from_year=2015, dry_run=True)
    assert not hasattr(repo, "birth_dates")
