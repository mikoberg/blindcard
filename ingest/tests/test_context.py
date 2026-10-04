import datetime as dt

from fakes import FakeRepository, make_bundle
from helpers import make_fight

from blindcard_ingest import cli
from blindcard_ingest.context_pipeline import run_ingest_context
from blindcard_ingest.models import EventBundle, ParsedEvent
from blindcard_ingest.scoring.career import CareerContext, career_json

SOURCE = "fakesource"


def rematch_bundle(event_id: str, date: dt.date) -> EventBundle:
    """One bout between the same two fighters, whatever the event (helpers.make_fight's A and B)."""
    fight = make_fight(source_id=f"{event_id}-f0")
    return EventBundle(
        event=ParsedEvent(source_id=event_id, name=f"Event {event_id}", event_date=date),
        fights=[fight],
    )


def test_career_json_has_exactly_what_the_card_shows() -> None:
    context = CareerContext(
        prior_meetings=1,
        win_streaks=(4, 0),
        prior_fights=(12, 3),
        prior_headliners=(2, 0),
        unbeaten=(False, True),
    )
    assert career_json(context) == {
        "meetings": 1,
        "a": {"streak": 4, "unbeaten": False},
        "b": {"streak": 0, "unbeaten": True},
    }


def test_context_is_stored_for_every_fight_and_a_rerun_changes_nothing() -> None:
    repo = FakeRepository()
    bundle = make_bundle("e1", dt.date(2024, 5, 1), fights=3, seed=2)
    repo.upsert_event_bundle(SOURCE, "UFC", bundle)

    first = run_ingest_context(repo, source_name=SOURCE)
    assert first == len(bundle.fights)
    assert set(repo.career) == {f.source_id for f in bundle.fights}
    snapshot = dict(repo.career)

    assert run_ingest_context(repo, source_name=SOURCE) == 0
    assert repo.career == snapshot


def test_a_later_event_sees_the_earlier_one_and_the_earlier_one_never_the_later() -> None:
    repo = FakeRepository()
    early = rematch_bundle("early", dt.date(2023, 1, 1))
    again = rematch_bundle("again", dt.date(2024, 1, 1))  # the same two fighters meet again
    repo.upsert_event_bundle(SOURCE, "UFC", early)
    repo.upsert_event_bundle(SOURCE, "UFC", again)

    run_ingest_context(repo, source_name=SOURCE)
    assert repo.career[early.fights[0].source_id]["meetings"] == 0
    assert repo.career[again.fights[0].source_id]["meetings"] == 1


def test_a_dry_run_writes_nothing() -> None:
    repo = FakeRepository()
    repo.upsert_event_bundle(SOURCE, "UFC", make_bundle("e1", dt.date(2024, 5, 1), seed=2))
    assert run_ingest_context(repo, source_name=SOURCE, dry_run=True) == 0
    assert repo.career == {}


def test_the_cli_knows_ingest_context() -> None:
    args = cli.build_parser().parse_args(["ingest-context", "--dry-run"])
    assert (args.command, args.dry_run) == ("ingest-context", True)
