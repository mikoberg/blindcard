# Expected ratings for upcoming fights

What it is: a guess at how an announced fight will rate once it has been fought, on the same 1 to 5
scale as every real rating. Shown on `/upcoming/[slug]` and the home page as a dashed "~3.4 expected"
plate, never in gold, with a "How we got this" view.

What it is not: it never says who wins, and it never uses a result or a private feature (finish,
pace, duration). The inputs are the same numbers a visitor can already see: the public star ratings
of each fighter's earlier fights, and the public context of the card (main event, co-main, title,
division, how deep on the card, whether they met before).

## How it works

- `ingest/src/blindcard_ingest/predict/dataset.py`: features per fight, built strictly from fights
  BEFORE its date (a fight never sees itself or another fight of the same night). One `Tracker`
  builds the training rows and the features of an upcoming bout, so they cannot drift apart.
  A fighter's average is shrunk toward the division average (few fights, little say). A debut gets the
  division average, and `experience` says how little that rests on.
- `predict/model.py`: ridge regression in pure Python (standardised features, unpenalised intercept).
- `predict/pipeline.py`: retrains on every run (seconds), predicts every announced bout, stores
  number + basis (both / one / none fighters known) + reasons. `MODEL_VERSION` is bumped on any change.
- `predict/evaluate.py` and `blindcard-ingest evaluate-predictions`: yearly walk-forward (train on the
  years before, predict the year) against two baselines. Never a random split.
- Storage: `upcoming_bouts.predicted_stars` etc. (migration 0013). Rows are deleted the day after the
  event, so a prediction is never shown next to the real rating of the same fight.

## Evaluation (dev data, active score version 21, walk-forward 2018 to 2026, 4451 fights)

| model | Pearson | Spearman | MAE | RMSE |
|---|---|---|---|---|
| constant (training mean) | -0.01 | 0.00 | 0.916 | 1.093 |
| context only (card, division) | 0.354 | 0.275 | 0.858 | 1.023 |
| fighters only (history) | 0.326 | 0.320 | 0.870 | 1.034 |
| **full** | **0.420** | **0.393** | **0.821** | **0.992** |

Calibration by predicted fifth (predicted to actual average rating): 2.58 to 2.56, 2.76 to 2.71,
2.89 to 2.88, 3.08 to 3.13, 3.72 to 3.78. The ordering holds; the spread of expectations is narrower
than the spread of real ratings.

Honest limits:

- The signal is real but modest (about 17% of the variance). A fight's rating depends heavily on how
  it unfolds, which is not knowable beforehand; a single fight regularly lands far from its expectation
  (typical miss about 0.8 stars).
- Within one card, the order of the card is already about as informative as the model for picking the
  best three fights (0.54 overlap with the real top three for both). Do not sell it as a ranking tool.
- The largest single effect is the spot on the card (main events rate higher). That is real in the
  data, and the "How we got this" view says so.

Re-run `blindcard-ingest evaluate-predictions` after any change to the features or the scores, and
update this table. Ship gate used: beat the context-only baseline on Spearman and MAE.

## Card level: tried and dropped

An "expected card rating" (the average of a card's bout expectations) was shown on the home tiles and
event headers at first. Checked walk-forward over 447 cards: Pearson 0.37 against the real card average,
but the expectations hardly differ between cards (sd 0.10 against 0.36 for the real averages), so
almost every event read 3.0. A linear calibration (slope 1.28) does not widen it (sd 0.13) and improves
the typical miss from 0.294 (always guess the average) to only 0.268. The honest conclusion: with public
data alone, cards cannot be told apart much beforehand. The tiles now name the bouts that promise the
most instead ("Look out for", expected 3.5 or more, at most two), which is the part that was validated.

Ideas to get sharper over time: fighter style features (pace, finish rate) would help, but they are
private result-derived data, and a prediction that moves after a finish would leak it; betting odds or
fan anticipation would be a separate, external signal.

## Who is favoured (picks)

Learned from past RESULTS, so it is private data: table `upcoming_picks` (migration 0014, RLS on, no
policies), served only by `upcoming_pick(bout_id)` through a POST route after a click on that bout.
`upcoming_bouts.has_pick` is public so the button only shows where there is something behind it.

Model (`predict/winner.py`): Elo ratings from every decisive result (newcomers move fast, veterans
slowly) plus experience, win share, recent form and time since the last fight, in a logistic model fitted
on both orientations of every fight (it cannot learn the a/b order). Strictly pre-fight, like the expected
rating. Refused (nothing stored) unless a walk-forward test clearly beats a coin
(accuracy minus two standard errors above 50%).

Walk-forward on dev data, 2016 to 2026, 5306 fights: accuracy 0.561, log loss 0.680 (coin: 0.693), higher
Elo alone 0.541. From 2020: 0.576. When the model is at least 65% sure it is right about 70% of the time,
but that happens on only about 6% of fights. Honest reading: a small lean, not a prediction to bet on.
The page says so and shows the walk-forward accuracy next to every pick.

Never shown next to a result: picks go when their bout goes. Logs carry counts and accuracy only.

Head-to-head and dominance (added after a question about an earlier meeting): the model now also sees
the net wins in earlier meetings (capped at two) and who won the latest one, and a finish moves the Elo
ratings more than a decision (a split or majority decision less). Walk-forward: accuracy is unchanged
within noise (0.558 from 2016, 0.575 from 2020) because only about 2% of fights are rematches; the log
loss improves slightly and consistently (0.6797 to 0.6783 from 2016, 0.6758 to 0.6743 from 2020).
Example: Yan and Dvalishvili have met twice (one win each, Yan won the latest), and Yan is now the slight
favourite (58%) where it was a coin flip before. The model still does not see HOW dominant a win was
beyond finish or decision.

## Fighter style: tried and dropped

Idea: two strikers should make a better fight. Each fighter's style was read from the Wikipedia infobox
(1534 of 2576 fighters with at least two rated fights; both fighters known in 59% of fights) and added
as striker / grappler / striker-vs-striker features. Walk-forward result: no gain (Spearman 0.383 without,
0.382 with; same typical miss). A fighter's earlier ratings already carry what the style would add. Not
shipped. Private pace and finish data would probably help but are result-derived (see above).

## Score sanity check (audit-scores)

`blindcard-ingest audit-scores [--strict]` compares the rate of classics (5.0) and of 4.5 and up in the
latest 6 and 12 events and in the last 3 years with the long-run rate, as a binomial tail ("how often by
luck alone"). Under 5% is a note, under 1% an alert (`--strict` then exits non-zero; the workflow runs it
last). Prompted by a user spotting 4 classics in 6 events. On the dev data: the long-run share of 5.0 is
1.27% (below the 1.5% target), and the only flag is a note for 2025 (12 of 520, 2.3%, chance 3.7%);
four of the six tiles on the home page is a stretch that has happened in about 1.3% of all 6-event
windows in the history.

## Fighting style on the upcoming cards (display only)

Shown under a fighter's name on `/upcoming/[slug]` ("Brazilian jiu-jitsu", "Muay Thai, Brazilian
jiu-jitsu"). Source: the infobox of the fighter's Wikipedia page, found through the link target of the
name on the card (a name without a link has no page and no style; nothing is guessed). The `style` field
is read first, then the arts named in `rank` (a black belt in kickboxing is a fair sign of a background);
only words from a fixed list come out (no stance, belt colour or hometown), at most three. Coverage on
the dev data: 65 of 148 fighters on the announced cards (87 have a linked page; many pages name neither a
style nor a rank). It is NOT used by the expected rating or the favourite: style was tested for the
expected rating and did not help (see above). The earlier test used a cruder parse that let stance and
hometown lines through as "styles"; it showed no gain either way and was not rerun on the clean labels.

## Score v22: five stars for the top 1.0% (was 1.5%)

After the audit flagged a run of classics, 5.0 was tightened: percentile 99.0 instead of 98.5 (still with
the 120 s minimum). v22 is v21 with only that threshold changed (identical weights, regenerated with
`fit-scoring --version 22`, then `rescore --version 22 --activate`). 40 of 8655 fights moved from 5.0 to
4.5 and nothing else changed: 110 classics became 70 (0.81% of fights: the 1% cut of the reference pool,
less the fights under 120 s). Per year 4 to 6 classics since 2013 instead of up to 12; of the six home page
tiles that showed four classics only Rahiki vs McMillen dropped out. The audit now measures itself against
the 0.81% long-run share and flags nothing. For about 1.0% of fights in practice, use 98.8.
Production: apply with `blindcard-ingest rescore --version 22 --activate` (the config file is committed).

## Elo leaderboard (spoiler page): is it real Elo?

The page `/fighters/elo` ranks fighters by an Elo rating and shows, per fighter, every step of the
calculation. The question was whether our Elo is "the real thing". Sources checked: Wikipedia's
article on the Elo rating system (formula, FIDE K values), Wikipedia's World Football Elo Ratings
(goal-difference multiplier) and the Fight Matrix FAQ (the best-known MMA Elo: decision credit, K).

- The core is the real thing: expected score 1 / (1 + 10^((Rb - Ra) / 400)) and a change of K * (S - E).
  Different K per player is standard (FIDE: 40 for new players, 20, 10).
- Our earlier variant multiplied K by 1.4 for a finish and 0.7 for a split or majority decision and left
  draws out. A K multiplier for the margin exists elsewhere (World Football Elo), but it is not standard
  Elo, and Fight Matrix does it differently: it gives the winner of a split decision a score of 0.667 and
  of a majority decision 0.833 (and a draw 0.5 each), a plain Elo score.

Walk-forward on 2016-2026 (5136 fights with a rating on both sides or one earlier fight), each fight
predicted before it is added, log loss of the Elo probability itself (coin 0.693; lower is better):

| variant | accuracy | log loss |
|---|---|---|
| plain win/loss, K by experience (20 + 40 / (1 + n/3)), draws 0.5 | 0.558 | 0.6814 |
| earlier variant: K multiplier 1.4 / 0.7, no draws | 0.564 | 0.6790 |
| decision credit as Fight Matrix, same K | 0.566 | 0.6796 |
| decision credit, K x 1.5 (30 + 60 / (1 + n/3)) | 0.568 | 0.6772 |
| decision credit, K x 2 | 0.572 | 0.6765 |
| FIDE steps (40 under 30 fights, then 20) | 0.558 | 0.6833 |
| fixed K 16 / 32 / 48 / 64 | 0.557-0.559 | 0.6818-0.6876 |

Chosen for the page (Elo version 2): standard Elo, K = 30 + 60 / (1 + fights / 3), decision credit as
Fight Matrix, draws counted, no K multiplier. It is the closest to textbook Elo and it predicts better than
the variant it replaces. K x 2 is a hair better still (0.0007, noise) and was not taken. The favourite of
an upcoming bout (`predict/winner.py`) keeps its own Elo tracker as one feature of a larger model; its
validation above is unchanged and it is not the number shown on the Elo page.

Honest reading: Elo alone predicts about 56-57% of fights, so the list is a summary of results, not a
forecast, and neighbouring ranks are within noise. Not modelled: weight class, inactivity (a fighter
away for years keeps the rating; the page only lists fighters who fought in the last two years), and
fights outside our data.

## Score v23: time under control only counts against a fight with little going on

Prompted by a fight (a three-round decision with 4 submission attempts, 2 reversals and 75% of the
time under control) that v22 rated 2.0 while a viewer remembered a good fight. v22 held time under
control without a finish against every fight with weight -0.36, whatever happened during it.

Checked on the 5577 fights of events with Fight / Performance of the Night labels (v22 scores):

- Fight of the Night rate falls with the share of the fight under control, for fights without a finish:
  11.1% under 30%, 5.7% for 30-50%, 5.4% for 50-70%, 1.4% for 70-85%, 0% above 85%. The penalty as a
  principle is right.
- Fights with 60%+ control and 5+ submission attempts plus reversals (57 fights) had 5 Fight of the Night
  bonuses; their v22 stars expected 2.8 (3+ actions: 10 against 6.6 expected). The same bonus rate is
  twice what the stars said. Small group, so not conclusive, and the bonuses themselves lean to striking
  fights, so they cannot settle what is "good" either. Position changes and scrambles are not in our
  statistics at all.
- A one-parameter fix: scale the penalty by `1 - min(1, (submission attempts + reversals) / 5)`. FOTN AUC
  on the labelled fights 0.8031 (v22) -> 0.8070 (waiver at 6), 0.8075 (at 5), 0.8084 (at 3); within
  fights without a finish 0.8548 -> 0.8559 at most. A small gain, consistent for every waiver value tried.

v23 is v22 with that one change, no refit (new feature `control_stalling`, same -0.36 weight; the old
feature stays computed so v22 and earlier reproduce exactly). Result on dev: 7606 of 8655 fights keep
their stars, 481 + 29 rise (29 by a full star), 539 fall by half a star. The fallers are ordinary
fights (mean 0.6 submission attempts plus reversals) that lose a rank to the risers, who have 4.2 on
average; stars are percentile-based, so every rise pushes some fights down. Classics 70 -> 72 (0.83%),
`audit-scores --strict` clean. The fight that prompted it goes from 2.0 to 2.5.

## Score v24: a one-sided knockout is not a dull fight

Prompted by a first-round TKO (4:59 of a three-round fight, 37 significant strikes for the winner and none
for the loser) that v23 rated 2.0. Nothing in the data was wrong: the loser landed nothing, so `min_pace`
(the pace of the less active fighter, the heaviest weight of v22 and v23, 1.0) was 0, and the finish
was almost at the bell, so it earned little for coming early.

Checked on the 5577 fights with bonus labels (v23 stars):

- First-round KO/TKOs where the loser landed nothing (135 fights) got a Performance of the Night bonus
  in 25% of the cases among those rated 2.0 or lower, 22% at 2.5-3.0 and 33% at 3.5 and up, against 2%
  for the other first-round KOs rated 2.0 or lower. The low stars were not what the bonuses said.
- The point of `min_pace` is two-way action in a fight that went on. In a finish the loser's output says
  little: the fight ended because one fighter did.

v24 is a fit like v22 (same recipe, same leak margin 0.30) with two changes to its features: `min_pace`
is replaced by `min_pace_nofinish` (zero after a real finish) and the fit takes v23's `control_stalling`
in place of `control_share_nofinish` (so the weight is fitted, -0.38, instead of copied). Held out on
2024 onwards: Fight of the Night AUC 0.778 (v22 0.795), Performance of the Night AUC 0.749 (0.737),
finish-in-round-1 AUC 0.665 (0.648). Bonus rate at 2.0 stars 3.3% (5.0%), at 4.5 stars 37.7% (36.4%), every
step still rising. KO/TKOs rated 2.0 or lower fell from 158 to 101 of 2,741 (decisions rose from 1,951 to
2,066 in the same range). `audit-scores --strict` clean.

Honest limit: this fight goes from the 17th to the 24th percentile and stays at 2.0 (2.5 starts at the
28th). Fixing that one fight outright would need a rule that lifts every one-sided KO, which the labels
do not support (the Fight of the Night AUC already gives up 0.017 here). Raising `--finish-leak` is the
other lever: more credit for every finish, at the cost of the Fight of the Night ranking.

## Score v25: a real knockout is never rated below 3 stars

v24 lifted knockouts without a rule, and a first-round TKO of 4:59 still came out at 2.0 (24th
percentile). The product decision is that a knockout is entertainment in itself: a real KO/TKO (not an
injury stoppage, `ko_finish` and `real_finish` both 1) never gets fewer than 3 stars. It is an editorial
rule in the config (`stars.knockout_min_stars = 3.0`), set by hand like the weight of `cut_short`: the bonus labels
cannot teach it, and it is not a fit. v25 has v24's weights to the digit.

Effect on dev: KO/TKOs rated 2.5 or lower went from 290 to 47 (of 2,741); those 47 are the stoppages for
an injury ("toLeg Injury" and the like), which are not knockouts. The percentile of a fight is not changed,
only the stars. Rated 3.0: 1,551 fights (1,299 in v24). `audit-scores --strict` clean. Submissions get no
floor (not asked for).

## Score v26: a real submission finish is never rated below 3 stars either

A standing guillotine choke after 57 seconds came out at 2.0 in v25 (the knockout floor did not cover it).
The same product decision as for knockouts: a finish is entertainment in itself. `stars.submission_min_stars =
3.0` sets the floor for a real submission (a finish that is not a knockout and not an injury stoppage);
the knockout floor stays. v26 has v25's weights to the digit.

Effect on dev: submissions rated 2.5 or lower went from 415 to 8 (of 1,331), the 8 being injury stoppages and
the like; 833 submissions now sit at 3.0. `audit-scores --strict` clean. The percentile of a fight is not changed.
