"""with_later_bouts: bouts after the latest stored fight count towards a fighter's record today."""

from __future__ import annotations


def test_bouts_after_the_latest_stored_fight_are_added_to_the_record() -> None:
    from blindcard_ingest.upcoming_records import with_later_bouts

    record = {"w": 10, "l": 2, "d": 0, "nc": 1}
    later = {"win": 2, "loss": 1, "draw": 1, "no_contest": 1, "mystery": 5}
    assert with_later_bouts(record, later) == {"w": 12, "l": 3, "d": 1, "nc": 2}
    assert with_later_bouts(record, {}) == record
    assert record == {"w": 10, "l": 2, "d": 0, "nc": 1}  # the input is never changed


def test_a_record_is_anchored_on_the_newest_fight_that_has_one() -> None:
    from blindcard_ingest.upcoming_records import record_from_history

    def fight(going_in, outcome="win", won=True):  # type: ignore[no-untyped-def]
        return {"going_in": going_in, "outcome": outcome, "won": won, "open": False}

    anchor = {"w": 18, "l": 9, "d": 0, "nc": 1}
    # the three newest fights have no record going in (a table that lags), all won
    history = [fight(None), fight(None), fight(None), fight(anchor)]
    assert record_from_history(history) == {"w": 22, "l": 9, "d": 0, "nc": 1}
    # a loss and a no contest among the later fights
    mixed = [fight(None, "no_contest", None), fight(None, "win", False), fight(anchor)]
    assert record_from_history(mixed) == {"w": 19, "l": 10, "d": 0, "nc": 2}


def test_no_anchor_or_an_unknown_later_result_gives_no_record() -> None:
    from blindcard_ingest.upcoming_records import record_from_history

    unknown = {"going_in": None, "outcome": "win", "won": None, "open": True}
    anchor = {
        "going_in": {"w": 1, "l": 0, "d": 0, "nc": 0},
        "outcome": "win",
        "won": True,
        "open": False,
    }
    assert record_from_history([unknown, anchor]) is None
    assert (
        record_from_history([{"going_in": None, "outcome": "win", "won": True, "open": False}])
        is None
    )
    assert record_from_history([]) is None
    # the common case is unchanged: the newest fight has its record going in
    assert record_from_history([anchor]) == {"w": 2, "l": 0, "d": 0, "nc": 0}
