# Blindcard

Spoiler-free fight rating site: fans see which fights on a card are worth watching without
learning any result. See `CLAUDE.md` for the spoiler rule and the legal guardrails.

Status: **Phase 2 (web)** is in place (`web/`, see `web/README.md`) on top of the Phase 1 data side. No user-rating blend, no ML (`ml/`).

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

Apply `supabase/migrations/0001_init.sql` to a Supabase project, then run the RLS tests
against a **throwaway** dev database:

```powershell
psql $env:TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
```

Result data (`fight_results`, `fight_rounds`, `excitement_features`) is private: RLS on, no
policies, privileges revoked. It is only served through `reveal_fight(fight_id)`, one fight
per call. Public tables hold pre-fight facts and the final stars/percentile only.

## Commands

```powershell
.\.venv\Scripts\blindcard-ingest backfill --from 2015        # all completed events from a year on
.\.venv\Scripts\blindcard-ingest rescore --version 1         # build the reference, score everything
.\.venv\Scripts\blindcard-ingest ingest-latest               # recent events not yet complete
```

All commands take `--dry-run`, `--log-level` and `--cache-dir`. Exit code `0` = ok, `1` = the
run finished with errors (unscored fights, failed or overdue events), `2` = bad configuration.

Typical first run: `backfill`, then `rescore --version 1` (the first version activates
itself; later versions need `--activate`). `ingest-latest` then scores new fights against the
active version's frozen reference, so existing ratings never drift.

## Scheduled ingest (GitHub Actions)

`.github/workflows/ingest-latest.yml` runs `ingest-latest` daily at 19:00 and 21:30 UTC (shortly
after the mirror's refresh, plus a retry; cron is UTC only, so Amsterdam time shifts with
daylight saving) and on demand (`workflow_dispatch`, with `since_days` and `dry_run` inputs).
The job is red when the run reports errors, and logs are sanitised of result data because
Actions logs of a public repository are public.

One-time setup before it can succeed:

1. Add the repository secret `DATABASE_URL` (Settings > Secrets and variables > Actions).
   Optionally set the repository variable `SCRAPER_CONTACT`; it defaults to this repository.
2. Apply the migration, run `backfill` and `rescore --version 1` once (locally or via a
   one-off job). Without an active score version the job fails on purpose.
3. Trigger it once by hand with `dry_run` enabled and check the log before trusting the schedule.

GitHub disables scheduled workflows in a public repo after 60 days without repository
activity; re-enable them under the Actions tab if that happens.

## Scoring

Weights, caps and the percentile-to-stars curve live in `ingest/config/scoring_v1.toml`; code
holds no tunable numbers. To try other weights, copy the file to `scoring_v2.toml`
(`version = 2`) and run `rescore --version 2`.

What gets a score, and what does not:

- No contests, overturned results and "Could Not Continue" are scored from their real stats,
  with `finish`, `finish_lateness` and `close_decision` set to 0. They must be scored: a fight
  without a score on the public card would itself reveal that something unusual happened.
- Left unscored (logged, and `ingest-latest` exits non-zero): a method string we have never
  seen, and formats with non-5-minute rounds (e.g. `3 Rnd (10-5-5)`), because the features
  assume 300 s rounds. In the current data that is 1 fight since 2000; 202 fights from
  1994-1999 have no usable round data (control time never recorded, or no stats at all).
- **Phase 2 requirement:** the web app must render an unscored fight exactly like a fight that
  is "not rated yet". Nothing may distinguish the two.

## Data source (read this)

ufcstats.com now puts a browser/bot check in front of its pages, and we do not bypass it.
Data comes from a public CSV mirror instead: <https://github.com/Greco1899/scrape_ufc_stats>
(GPL-3.0, republishing ufcstats statistics). Consequences:

- The mirror is not live: it commits a refresh about once a day, around 18:04 UTC (observed on
  the commit history, not a guarantee). A Saturday-night event therefore shows up around
  20:00 Amsterdam time on Sunday, not the morning after, so the "ready the morning after"
  goal is not met by this source. It also depends on the maintainer's own scraper, which may
  break without warning. The scheduled job (below) therefore runs after the daily refresh.
- It has no Fight/Performance of the Night bonuses (`bonuses` stays empty) and no fighter ids:
  fighters are keyed by name, so a few homonyms (e.g. two "Bruno Silva") are merged into one
  fighter row. Phase 1 has no fighter pages, so this is harmless for now.
- Each run reads one pinned commit (all files from the same snapshot). Raw CSVs are cached in
  `ingest/.cache/` (gitignored) and are never committed.
