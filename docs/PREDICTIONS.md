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
