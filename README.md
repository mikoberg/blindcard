# Blindcard

Spoiler-free fight rating site: fans see which fights on a card are worth watching without
learning any result. See `CLAUDE.md` for the spoiler rule and the legal guardrails.

Status: the data side (`ingest/`), the schema (`supabase/`) and the site (`web/`, see `web/README.md`) are in place: ratings, the Reveal, upcoming cards with expected ratings and a click-gated model lean, judge pages and a classics page. No user-rating blend and no ML (`ml/`) yet. `docs/RUNBOOK.md` is the step-by-step for setting up production and running the checks; `docs/PREDICTIONS.md` documents the models and their evaluation.

```
ingest/     Python 3.12: data source, scoring, CLI          (pytest)
supabase/   Postgres schema (migrations) + RLS tests
web/        Next.js site (Phase 2)
ml/         Phase 4 placeholder
```

## Setup (Windows, PowerShell)

```powershell
cd ingest
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
Copy-Item ..\.env.example .env      # then fill in DATABASE_URL and SCRAPER_CONTACT
.\.venv\Scripts\python.exe -m pytest
```

Settings come from environment variables or `ingest/.env` (never commit it):

| Variable | Needed for | Meaning |
|---|---|---|
| `DATABASE_URL` | all commands | Postgres connection string (Supabase session pooler) |
| `SCRAPER_CONTACT` | `backfill`, `ingest-latest` | public contact URL for the User-Agent; no default on purpose |
| `CACHE_DIR`, `LOG_LEVEL`, `REQUEST_INTERVAL_SECONDS` | optional | interval must be >= 1 s |
| `TEST_DATABASE_URL` | DB integration tests | a throwaway database, never production |

## Database

Apply the migrations with the ledger-based runner (never by hand), then run the RLS tests against a
**throwaway** database:

```powershell
.\.venv\Scriptslindcard-ingest migrate              # supabase/migrations/NNNN_*.sql in order, recorded in public.schema_migrations
.\.venv\Scriptslindcard-ingest rls-test             # supabase/tests/rls.sql on TEST_DATABASE_URL, rolled back
```

Result data (`fight_results`, `fight_rounds`, `excitement_features`, `upcoming_picks`) is private:
RLS on, no policies, privileges revoked. It is only served through narrow SECURITY DEFINER
functions, one row per call (`reveal_fight`, `reveal_score`, `judge_disputed_cards`,
`upcoming_pick`). Public tables hold pre-fight facts and the final stars/percentile only.

## Commands

The full order for a new database is in `docs/RUNBOOK.md`. The main ones:

```powershell
.\.venv\Scriptslindcard-ingest backfill --from 2001        # all completed events from a year on
.\.venv\Scriptslindcard-ingest rescore --version 22 --activate   # build the reference, score everything
.\.venv\Scriptslindcard-ingest ingest-latest               # recent events not yet complete
.\.venv\Scriptslindcard-ingest audit-scores --strict       # do the newest scores look like they should?
```

`blindcard-ingest --help` lists the rest (fighter facts, segments, bonuses, judges, upcoming cards,
predictions, styles, videos).

All commands take `--dry-run`, `--log-level` and `--cache-dir`. Exit code `0` = ok, `1` = the
run finished with errors (unscored fights, failed or overdue events), `2` = bad configuration.

`ingest-latest` scores new fights against the active version's frozen reference, so existing
ratings never drift. A later score version needs `--activate` to take over.

## Scheduled ingest (GitHub Actions)

`.github/workflows/ingest-latest.yml` runs daily at 19:00 and 21:30 UTC (shortly after the
mirror's refresh, plus a retry; cron is UTC only, so Amsterdam time shifts with daylight saving)
and on demand (`workflow_dispatch`, with `since_days` and `dry_run` inputs). It has three jobs so
that one slow part cannot hold up the rest: `ingest` (events, ratings, records, bonuses, judges),
`upcoming` (announced cards, start times, expected ratings, model leans, the score audit) and
`styles` (fighting styles from the official athlete pages, 15 s per page). A job is red when any of
its steps failed, and logs are sanitised of result data because Actions logs of a public
repository are public. `.github/workflows/ci.yml` runs lint, tests and the dependency audit on
every push and pull request.

One-time setup is in `docs/RUNBOOK.md`. Without an active score version the `ingest` job fails
on purpose.

## Scoring

Weights, caps and the percentile-to-stars curve live in `ingest/config/scoring_vN.toml` (the
active version is 22); code holds no tunable numbers. Versions are immutable: to try other
weights, `fit-scoring --version N` writes a new file, and `rescore --version N` scores everything
with it (`--activate` makes it the one the site uses). `audit-scores` checks that the newest
events still look like the long-run distribution (for example the share of 5.0 classics).

What gets a score, and what does not:

- No contests, overturned results and "Could Not Continue" are scored from their real stats,
  with `finish`, `finish_lateness` and `close_decision` set to 0. They must be scored: a fight
  without a score on the public card would itself reveal that something unusual happened.
- Left unscored (logged, and `ingest-latest` exits non-zero): a method string we have never
  seen, and formats with non-5-minute rounds (e.g. `3 Rnd (10-5-5)`), because the features
  assume 300 s rounds. In the current data that is 1 fight since 2000; 202 fights from
  1994-1999 have no usable round data (control time never recorded, or no stats at all).
- The web app renders an unscored fight exactly like a fight that is "not rated yet". Nothing may
  distinguish the two.

## Data sources (read this)

ufcstats.com puts a browser/bot check in front of its pages, and we do not bypass it. The fight
statistics come from a public CSV mirror instead: <https://github.com/Greco1899/scrape_ufc_stats>
(GPL-3.0, republishing ufcstats statistics). Consequences:

- The mirror is not live: it commits a refresh about once a day, around 18:04 UTC (observed on
  the commit history, not a guarantee). A Saturday-night event therefore shows up around
  20:00 Amsterdam time on Sunday, not the morning after. It also depends on the maintainer's own
  scraper, which may break without warning. The scheduled job runs after the daily refresh.
- It has no fighter ids: fighters are keyed by name, so a few homonyms (for example two "Bruno
  Silva") are merged into one fighter row. This is a known limit; fighter pages show the merged
  record.
- Each run reads one pinned commit (all files from the same snapshot). Raw CSVs are cached in
  `ingest/.cache/` (gitignored) and are never committed.

Other sources, each read politely (about 1 request per second, identifying User-Agent, cached):

- Wikipedia (CC BY-SA): card segments, bonuses, fighter countries, styles and pre-fight records,
  the announced upcoming cards.
- The official event pages (start times) and athlete pages (fighting style), at the site's crawl
  delay of 15 s and only where its robots.txt allows.
- Sherdog (records, as a fallback) and Wikidata (countries).
- The official YouTube channel (video ids of the classics), through the YouTube Data API.
