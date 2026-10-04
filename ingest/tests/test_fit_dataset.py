import datetime as dt

from fakes import FakeRepository, make_bundle

from blindcard_ingest.fit.dataset import build_rows
from blindcard_ingest.scoring.features import FEATURE_NAMES, MethodKind

DATE = dt.date(2024, 3, 2)


def test_rows_carry_features_labels_and_context() -> None:
    repo = FakeRepository()
    bundle = make_bundle("e1", DATE, seed=3)
    repo.upsert_event_bundle("ufcstats", "UFC", bundle)
    repo.set_bonuses(
        "ufcstats",
        {
            bundle.fights[0].source_id: ["fight_of_the_night"],
            bundle.fights[1].source_id: ["performance_of_the_night"],
        },
    )

    rows, skipped = build_rows(repo.labeled_fights("ufcstats"))

    assert skipped == 0 and len(rows) == len(bundle.fights)
    assert all(set(r.raw) == set(FEATURE_NAMES) and r.year == 2024 for r in rows)
    by_id = {r.fight_id: r for r in rows}
    assert by_id[bundle.fights[0].source_id].fotn and not by_id[bundle.fights[0].source_id].potn
    assert by_id[bundle.fights[1].source_id].potn and not by_id[bundle.fights[1].source_id].fotn
    assert sum(r.fotn or r.potn for r in rows) == 2
    assert all(isinstance(r.method, MethodKind) for r in rows)
    assert {r.fights_on_card for r in rows} == {len(bundle.fights)}
