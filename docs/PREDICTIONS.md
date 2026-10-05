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
