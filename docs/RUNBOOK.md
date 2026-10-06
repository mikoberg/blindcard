# Runbook

How to bring Blindcard up from nothing, run it, and check it. Commands are for Windows PowerShell
from the repository root unless stated otherwise. Never paste secrets in chat, issues or commits.

## 1. One-time setup for production

These steps need an account owner; they cannot be scripted from this repository.

1. **Create a new Supabase project for production.** The development project is also the test
   database (`TEST_DATABASE_URL`) and must not be served to the public.
2. **Disable signups** (Authentication > Sign In / Providers > "Allow new users to sign up" off, and
   email provider off). The site has no accounts yet; the anon key is public, so anyone could
   otherwise create a signed-in user.
3. **Secrets and variables**
   - GitHub repository secret `DATABASE_URL`: the **session pooler** connection string of the
     production project (the runners have IPv4 only).
   - Optional GitHub secret `TEST_DATABASE_URL`: a **throwaway** database for the CI RLS test. Never
     the production URL.
   - Optional GitHub variable `SCRAPER_CONTACT`: public contact URL for the User-Agent.
   - Vercel (or other host) environment: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     (production project, anon key only), `NEXT_PUBLIC_SITE_URL` (the public https URL) and
     `NEXT_PUBLIC_CONTACT_EMAIL` (the address shown on the contact page). The service-role key is
     never set in the web app.
4. **Local `ingest/.env`** with `DATABASE_URL` (production, only for the one-off load below),
   `SCRAPER_CONTACT`, and optionally `YOUTUBE_API_KEY`. It is git-ignored.

## 2. Load the database

From `ingest/` with the virtualenv (see the root README for the install):

```powershell
.\.venv\Scripts\blindcard-ingest migrate                      # all supabase/migrations, recorded in public.schema_migrations
.\.venv\Scripts\blindcard-ingest backfill --from 2001         # every completed event (hours; resumable, cached)
.\.venv\Scripts\blindcard-ingest rescore --version 22 --activate
.\.venv\Scripts\blindcard-ingest ingest-context
.\.venv\Scripts\blindcard-ingest ingest-fighters --from 2001
.\.venv\Scripts\blindcard-ingest ingest-segments --from 2001
.\.venv\Scripts\blindcard-ingest ingest-bonuses --from 2001
.\.venv\Scripts\blindcard-ingest ingest-judges
.\.venv\Scripts\blindcard-ingest ingest-upcoming
.\.venv\Scripts\blindcard-ingest compute-elo                  # Elo on the cards (going in) and the Elo page; after ingest-upcoming
.\.venv\Scripts\blindcard-ingest predict-upcoming
.\.venv\Scripts\blindcard-ingest predict-picks
.\.venv\Scripts\blindcard-ingest audit-scores --strict
```

Notes:

- `migrate` runs each file in its own transaction and refuses a file that changed after it was
  applied. `migrate --dry-run` lists what would run. `--baseline-through N` is only for a database
  that was set up by hand before the ledger existed (empty ledger only).
- Always run `migrate` **before** deploying a web build that depends on a new migration (0019: `upcoming_pick`
  date guard; 0020, 0021 and 0024: the folded search columns and the last-fight date, without which `/api/search`, `/api/fighters` and `/fighters` fail; 0022 and 0023: the Elo tables).
- Use `ingest-fighters --from 2001 --styles-only` to refresh only the fighting styles.
- `ingest-ufc-styles --limit 40` drips fighting styles from the official athlete pages (15 s per page,
  the crawl delay); the daily job does this on its own.
- `ingest-videos` needs `YOUTUBE_API_KEY` (see `docs/TODO.md`).
- Every command takes `--dry-run`. Exit code 0 = ok, 1 = finished with errors, 2 = bad configuration.

## 3. Daily job

`.github/workflows/ingest-latest.yml` runs at 19:00 and 21:30 UTC in three jobs: `ingest`,
`upcoming` and `styles` (see the comments in the file). A job is red when any of its steps failed;
the other jobs still run. GitHub disables scheduled workflows after 60 days without repository
activity: re-enable them under the Actions tab.

Trigger it once by hand with `dry_run` on and read the log before trusting the schedule.

## 4. Checks before every deploy

```powershell
cd ingest;  .\.venv\Scripts\python.exe -m pytest ; .\.venv\Scripts\ruff check . ; cd ..
cd web;     npm run typecheck ; npm run lint ; npm test ; npm run build ; cd ..
.\ingest\.venv\Scripts\blindcard-ingest rls-test          # TEST_DATABASE_URL, a throwaway database
```

Then the live spoiler suite against a production build (see `web/README.md`), and the
`spoiler-check` skill for any user-facing change. CI (`.github/workflows/ci.yml`) runs the first
two blocks, and the RLS test when the `TEST_DATABASE_URL` secret exists.

## 5. Backups and freshness

- Supabase Pro has daily backups; the free plan has none. Before launch either upgrade, or schedule
  `pg_dump` of the production database to storage you control, and test a restore once.
- The data is rebuildable from the sources (`backfill`), which takes hours, so a backup is about
  speed, not survival. The private tables (`fight_results`, `fight_rounds`, `excitement_features`,
  `upcoming_picks`) are included in any dump: store dumps as private data.
- Freshness: if the `ingest` job is red two days in a row, look at the Actions log first (sources change their layout without warning).

## 6. Abuse and rate limits

The app has no rate limiting of its own (it is stateless on purpose). The routes that reach the
database per call are `/api/reveal/*`, `/api/upcoming/*/pick`, `/api/judges/*/disputes` and
`/api/fighters`. Before launch set limits at the host: on Vercel a WAF rate-limit rule on `/api/*`
(for example 60 requests per minute per IP, and a stricter one on `/api/reveal/*`), or Cloudflare in
front. The reveal functions return one row per call and never a list, so scraping all results costs
one request per fight; a limit makes that slow, it cannot make it impossible.

Security headers and a static Content-Security-Policy are set in `web/next.config.ts` (the policy
only in production builds). If a page ever needs an outside script, image or font, the policy must
be changed on purpose.

## 7. Rolling back

- Web: redeploy the previous build from the host.
- Database: migrations are forward-only. Fix forward with a new numbered migration; never edit an
  applied one (the ledger refuses it).
- Scores: `rescore --version N --activate` switches the active score version; older versions stay
  in the database.
