import datetime as dt

from blindcard_ingest.scoring.career import (
    UNBEATEN_MIN_FIGHTS,
    HistoryBout,
    career_contexts,
)


def day(n: int) -> dt.date:
    return dt.date(2020, 1, 1) + dt.timedelta(days=n)


def bout(
    fight_id: str,
    when: int,
    a: str,
    b: str,
    winner: str | None,
    *,
    position: int = 5,
    title: bool = False,
    outcome: str = "win",
    has_result: bool = True,
) -> HistoryBout:
    return HistoryBout(
        fight_id=fight_id,
        event_date=day(when),
        card_position=position,
        is_title_fight=title,
        fighter_a=a,
        fighter_b=b,
        winner=winner,
        has_result=has_result,
        outcome=outcome,
    )


def test_a_debut_has_no_history() -> None:
    context = career_contexts([bout("f1", 0, "ann", "bea", "ann")])["f1"]
    assert context.prior_meetings == 0
    assert context.win_streaks == (0, 0)
    assert context.prior_fights == (0, 0)
    assert context.unbeaten == (False, False)


def test_only_earlier_bouts_count_and_a_bout_never_sees_itself_or_its_event() -> None:
    contexts = career_contexts(
        [
            bout("f1", 0, "ann", "bea", "ann"),
            bout("f2", 0, "ann", "cat", "ann"),  # same day: does not see f1
            bout("f3", 7, "ann", "dee", "dee"),
        ]
    )
    assert contexts["f2"].prior_fights == (0, 0)
    assert contexts["f3"].prior_fights == (2, 0)  # ann had f1 and f2 before
    assert contexts["f3"].win_streaks == (2, 0)


def test_a_rematch_counts_earlier_meetings_in_either_order() -> None:
    contexts = career_contexts(
        [
            bout("f1", 0, "ann", "bea", "ann"),
            bout("f2", 30, "bea", "ann", "bea"),
            bout("f3", 60, "ann", "bea", "ann"),
            bout("f4", 90, "ann", "cat", "ann"),
        ]
    )
    assert contexts["f1"].prior_meetings == 0
    assert contexts["f2"].prior_meetings == 1
    assert contexts["f3"].prior_meetings == 2  # a rubber match
    assert contexts["f4"].prior_meetings == 0


def test_win_streaks_grow_with_wins_and_reset_on_a_loss_or_a_draw() -> None:
    contexts = career_contexts(
        [
            bout("f1", 0, "ann", "x1", "ann"),
            bout("f2", 10, "ann", "x2", "ann"),
            bout("f3", 20, "ann", "x3", None, outcome="draw"),
            bout("f4", 30, "ann", "x4", "ann"),
            bout("f5", 40, "ann", "x5", "x5"),
            bout("f6", 50, "ann", "x6", "ann"),
        ]
    )
    assert [contexts[f].win_streaks[0] for f in ("f2", "f3", "f4", "f5", "f6")] == [1, 2, 0, 1, 0]


def test_a_no_contest_neither_adds_a_win_nor_breaks_a_streak() -> None:
    contexts = career_contexts(
        [
            bout("f1", 0, "ann", "x1", "ann"),
            bout("f2", 10, "ann", "x2", None, outcome="no_contest"),
            bout("f3", 20, "ann", "x3", "ann"),
        ]
    )
    assert contexts["f3"].win_streaks[0] == 1
    assert contexts["f3"].prior_fights[0] == 2


def test_unbeaten_needs_enough_fights_and_no_loss_and_a_draw_is_not_a_loss() -> None:
    bouts = [bout(f"w{i}", i * 10, "ann", f"o{i}", "ann") for i in range(UNBEATEN_MIN_FIGHTS)]
    bouts.append(bout("next", 100, "ann", "newcomer", "ann"))
    contexts = career_contexts(bouts)
    assert contexts[f"w{UNBEATEN_MIN_FIGHTS - 1}"].unbeaten[0] is False  # only 4 fights so far
    assert contexts["next"].unbeaten == (True, False)

    with_draw = bouts[:-1] + [
        bout("d", 90, "ann", "dd", None, outcome="draw"),
        bout("after", 100, "ann", "newcomer", "ann"),
    ]
    assert career_contexts(with_draw)["after"].unbeaten[0] is True
    with_loss = bouts[:-1] + [
        bout("l", 90, "ann", "ll", "ll"),
        bout("after", 100, "ann", "newcomer", "ann"),
    ]
    assert career_contexts(with_loss)["after"].unbeaten[0] is False


def test_headliners_count_earlier_main_events_and_title_fights_only() -> None:
    contexts = career_contexts(
        [
            bout("f1", 0, "ann", "x1", "ann", position=1),
            bout("f2", 10, "ann", "x2", "ann", position=7, title=True),
            bout("f3", 20, "ann", "x3", "ann", position=7),
            bout("f4", 30, "ann", "x4", "ann", position=3),
        ]
    )
    assert contexts["f4"].prior_headliners == (2, 0)


def test_bouts_without_a_result_are_not_history_for_later_ones() -> None:
    contexts = career_contexts(
        [
            bout("f1", 0, "ann", "x1", None, has_result=False),
            bout("f2", 10, "ann", "x2", "ann"),
        ]
    )
    assert contexts["f2"].prior_fights == (0, 0)


def test_the_order_of_the_input_does_not_matter() -> None:
    bouts = [
        bout("f1", 0, "ann", "bea", "ann"),
        bout("f2", 30, "bea", "ann", "bea"),
        bout("f3", 60, "ann", "cat", "ann"),
    ]
    assert career_contexts(bouts) == career_contexts(list(reversed(bouts)))


def test_unbeaten_is_only_claimed_for_debuts_after_our_history_is_reliable() -> None:
    """History starts in 2001: a veteran's earlier losses may be missing, so no claim."""
    old = dt.date(2001, 6, 1)
    veteran = [
        HistoryBout(f"v{i}", old + dt.timedelta(days=60 * i), 5, False, "vet", f"o{i}", "vet")
        for i in range(UNBEATEN_MIN_FIGHTS + 1)
    ]
    assert career_contexts(veteran)[f"v{UNBEATEN_MIN_FIGHTS}"].unbeaten == (False, False)

    newcomer = [
        HistoryBout(
            f"n{i}",
            dt.date(2010, 1, 1) + dt.timedelta(days=60 * i),
            5,
            False,
            "new",
            f"o{i}",
            "new",
        )
        for i in range(UNBEATEN_MIN_FIGHTS + 1)
    ]
    assert career_contexts(newcomer)[f"n{UNBEATEN_MIN_FIGHTS}"].unbeaten == (True, False)


def test_the_record_so_far_counts_wins_losses_draws_and_no_contests() -> None:
    contexts = career_contexts(
        [
            bout("f1", 0, "ann", "x1", "ann"),
            bout("f2", 10, "ann", "x2", "x2"),
            bout("f3", 20, "ann", "x3", None, outcome="draw"),
            bout("f4", 30, "ann", "x4", None, outcome="no_contest"),
            bout("f5", 40, "ann", "x5", "ann"),
            bout("f6", 50, "ann", "x6", "ann"),
        ]
    )
    assert contexts["f1"].prior_records[0] == (0, 0, 0, 0)
    assert contexts["f6"].prior_records[0] == (2, 1, 1, 1)
    assert contexts["f6"].prior_records[1] == (0, 0, 0, 0)  # the newcomer


def test_the_record_never_includes_the_bout_itself() -> None:
    contexts = career_contexts([bout("f1", 0, "ann", "bea", "ann")])
    assert contexts["f1"].prior_records == ((0, 0, 0, 0), (0, 0, 0, 0))


def test_the_record_so_far_is_only_vouched_for_when_the_whole_career_is_in_our_history() -> None:
    old = dt.date(2001, 6, 1)
    veteran = [
        HistoryBout(f"v{i}", old + dt.timedelta(days=60 * i), 5, False, "vet", f"o{i}", "vet")
        for i in range(3)
    ]
    assert career_contexts(veteran)["v2"].complete_history == (False, False)

    newcomer = [
        HistoryBout(
            f"n{i}",
            dt.date(2010, 1, 1) + dt.timedelta(days=60 * i),
            5,
            False,
            "new",
            f"o{i}",
            "new",
        )
        for i in range(3)
    ]
    context = career_contexts(newcomer)["n2"]
    assert context.complete_history == (True, True)  # the opponents debuted in our data too

    debut = career_contexts([bout("d1", 0, "ann", "bea", "ann")])["d1"]
    assert debut.complete_history == (True, True) and debut.prior_records == ((0, 0, 0, 0),) * 2
