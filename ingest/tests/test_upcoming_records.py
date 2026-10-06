"""with_later_bouts: bouts after the latest stored fight count towards a fighter's record today."""

from __future__ import annotations


def test_bouts_after_the_latest_stored_fight_are_added_to_the_record() -> None:
    from blindcard_ingest.upcoming_records import with_later_bouts

    record = {"w": 10, "l": 2, "d": 0, "nc": 1}
    later = {"win": 2, "loss": 1, "draw": 1, "no_contest": 1, "mystery": 5}
    assert with_later_bouts(record, later) == {"w": 12, "l": 3, "d": 1, "nc": 2}
    assert with_later_bouts(record, {}) == record
    assert record == {"w": 10, "l": 2, "d": 0, "nc": 1}  # the input is never changed
