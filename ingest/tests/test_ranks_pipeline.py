"""ingest-ranks: the ranking before an event is the article's last revision from before it."""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

from fakes import FakeRepository

from blindcard_ingest.predict.types import RankBout
from blindcard_ingest.ranks_pipeline import ranks_for, revision_before, run_ingest_ranks

LAYOUTS = json.loads(
    (Path(__file__).parent / "fixtures" / "wikipedia" / "ufc_rankings_layouts.json").read_text(
        encoding="utf-8"
    )
)
UTC = dt.UTC


def at(year: int, month: int, day: int, hour: int = 12) -> dt.datetime:
    return dt.datetime(year, month, day, hour, tzinfo=UTC)


class FakeWiki:
    """Revisions: one in 2018 (old layout), one in 2024 (newer layout)."""

    def __init__(self) -> None:
        self.revisions = [(100, at(2018, 6, 1)), (200, at(2024, 5, 21)), (300, at(2026, 10, 3))]
        self.texts = {100: LAYOUTS["2018"], 200: LAYOUTS["2024"], 300: LAYOUTS["current"]}
        self.asked: list[int] = []

    def ranking_revisions(self, since: dt.datetime):  # type: ignore[no-untyped-def]
        # Like the real client: the revision in force at `since`, then everything newer.
        before = [r for r in self.revisions if r[1] < since][-1:]
        return before + [r for r in self.revisions if r[1] >= since]

    def revision_wikitexts(self, revids):  # type: ignore[no-untyped-def]
        self.asked = list(revids)
        return {r: self.texts[r] for r in revids}


def bout(key: str, day: dt.date, a: str, b: str, division: str | None = "Lightweight") -> RankBout:
    return RankBout(key=key, event_date=day, weight_class=division, a_name=a, b_name=b)


def test_the_revision_in_force_is_the_last_one_before_midnight_of_the_event_date() -> None:
    revisions = [(1, at(2024, 5, 14)), (2, at(2024, 5, 21)), (3, at(2024, 5, 28))]
    assert revision_before(revisions, at(2024, 5, 25, 0)) == 2
    assert (
        revision_before(revisions, at(2024, 5, 21, 0)) == 1
    )  # an edit made on the day is not used
    assert revision_before(revisions, at(2024, 5, 14, 0)) is None


def test_a_fight_takes_the_places_of_its_two_fighters_in_its_own_division() -> None:
    texts = {200: LAYOUTS["2024"]}
    ranks = ranks_for(
        [
            bout("f1", dt.date(2024, 6, 1), "Arman Tsarukyan", "Charles Oliveira"),
            bout("f2", dt.date(2024, 6, 1), "Islam Makhachev", "Nobody Special"),
            bout(
                "f3",
                dt.date(2024, 6, 1),
                "Arman Tsarukyan",
                "Charles Oliveira",
                division="Welterweight",
            ),
            bout("f4", dt.date(2024, 6, 1), "Arman Tsarukyan", "Charles Oliveira", division=None),
        ],
        {"f1": 200, "f2": 200, "f3": 200, "f4": 200},
        texts,
    )
    assert ranks["f1"] == (1, 2)
    assert ranks["f2"] == (0, None)  # the champion, and an unranked opponent
    assert ranks["f3"] == (None, None)  # not ranked in that division
    assert ranks["f4"] == (None, None)  # catch weight: no division


def test_names_match_without_accents_and_a_missing_revision_gives_nothing() -> None:
    ranks = ranks_for(
        [
            bout("f1", dt.date(2024, 6, 1), "Arman Tsarukyan", "Charles Oliveira"),
            bout("f2", dt.date(2010, 1, 1), "A", "B"),
        ],
        {"f1": 200},
        {200: LAYOUTS["2024"].replace("Arman Tsarukyan", "Árman Tsarukyan")},
    )
    assert ranks["f1"] == (1, 2)
    assert ranks["f2"] == (None, None)


def test_run_gives_each_event_the_ranking_of_its_own_time_and_announced_bouts_the_newest() -> None:
    repo = FakeRepository()
    repo.rank_bout_rows = [
        bout("old", dt.date(2018, 7, 7), "Khabib Nurmagomedov", "Someone Else"),
        bout("mid", dt.date(2024, 6, 1), "Arman Tsarukyan", "Charles Oliveira"),
    ]
    repo.rank_bout_upcoming_rows = [
        bout("next", dt.date(2026, 10, 10), "Justin Gaethje", "Ilia Topuria")
    ]
    wiki = FakeWiki()
    report = run_ingest_ranks(wiki, repo, from_year=2018, min_listed=3)
    assert repo.fight_ranks["old"] == (0, None)  # champion in 2018
    assert repo.fight_ranks["mid"] == (1, 2)  # the 2024 table
    assert repo.upcoming_ranks["next"] == (0, 1)  # the current table
    assert sorted(wiki.asked) == [100, 200, 300] and report.revisions_used == 3


def test_a_dry_run_stores_nothing() -> None:
    repo = FakeRepository()
    repo.rank_bout_rows = [bout("mid", dt.date(2024, 6, 1), "Arman Tsarukyan", "Charles Oliveira")]
    run_ingest_ranks(FakeWiki(), repo, from_year=2018, dry_run=True, min_listed=3)
    assert not hasattr(repo, "fight_ranks") and not hasattr(repo, "upcoming_ranks")


def test_nothing_to_rank_asks_the_wiki_nothing() -> None:
    wiki = FakeWiki()
    report = run_ingest_ranks(wiki, FakeRepository(), from_year=2018)
    assert report.bouts == 0 and wiki.asked == []


def test_logs_carry_counts_only(caplog) -> None:  # type: ignore[no-untyped-def]
    repo = FakeRepository()
    repo.rank_bout_rows = [bout("mid", dt.date(2024, 6, 1), "Arman Tsarukyan", "Charles Oliveira")]
    with caplog.at_level("INFO"):
        run_ingest_ranks(FakeWiki(), repo, from_year=2018, min_listed=3)
    assert "Tsarukyan" not in caplog.text and "1 bouts" in caplog.text


def test_a_revision_that_cannot_be_read_is_stepped_back_from_not_taken_for_nobody_ranked() -> None:
    repo = FakeRepository()
    repo.rank_bout_rows = [bout("mid", dt.date(2024, 6, 1), "Arman Tsarukyan", "Charles Oliveira")]
    wiki = FakeWiki()
    wiki.texts[200] = "== Weight class rankings ==\nnothing we know how to read"
    # the event is after revision 200 (2024-05-21) whose text is unreadable: revision 100 is used
    report = run_ingest_ranks(wiki, repo, from_year=2018, min_listed=3)
    assert report.unreadable_revisions == 1 and report.unreadable_bouts == 0
    assert repo.fight_ranks["mid"] == (None, None)  # the 2018 table has neither of them
    assert 100 in wiki.asked


def test_a_bout_with_no_readable_revision_in_reach_is_left_without_a_rank() -> None:
    repo = FakeRepository()
    repo.rank_bout_rows = [bout("mid", dt.date(2024, 6, 1), "Arman Tsarukyan", "Charles Oliveira")]
    wiki = FakeWiki()
    wiki.texts = {r: "unreadable" for r in wiki.texts}
    report = run_ingest_ranks(wiki, repo, from_year=2018, min_listed=3)
    assert report.unreadable_bouts == 1
    assert repo.fight_ranks["mid"] == (None, None)
