# Blindcard web

Next.js 16 (App Router, TypeScript, Tailwind) site: the latest card on `/`, an event list on
`/events`, and a card page per event at `/events/[slug]` with 1-5 star ratings, "Watch these",
"Hidden gem" and a per-fight Reveal. Fans see which fights are worth watching without learning
any result.

Design: `../docs/superpowers/specs/2026-10-04-web-phase2-design.md`. The spoiler rule and the
legal guardrails are in `../CLAUDE.md`.

This is not the Next.js you may know. Before using a framework API, read the matching guide in
`node_modules/next/dist/docs/` (see `AGENTS.md`).

## Run it

```powershell
cd web
npm install
Copy-Item .env.example .env.local     # then fill in the DEV project URL and anon key
npm run dev                            # http://localhost:3000
```

`.env.example` lists `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`NEXT_PUBLIC_SITE_URL` (absolute URLs for the sitemap and Open Graph; the local default is
`http://localhost:3000`). `.env.local` is gitignored. Use the DEV Supabase project and the anon
(publishable) key only; the service-role key must never be used in this app.

The data must exist first: run `backfill` and `rescore --version 1` from `ingest/` (see the root
README).

## Checks

```powershell
npm test                 # vitest run (config: vitest.config.mts)
npm run typecheck        # tsc --noEmit
npm run lint             # eslint
npm run build            # next build
```

- `npm test` runs the unit tests. The database integration tests (`tests/data/integration.test.ts`)
  only run when the Supabase URL and anon key are set in `.env.local` (or `.env`); otherwise they
  are skipped.
- `npm run build` needs `.env.local` with the DEV Supabase URL and anon key, because the pages
  prerender against the database.

### Live spoiler regression suite

`tests/spoiler/rendered.test.ts` fetches a running production build and scans the HTML, the Next
data payloads and the client bundles for result data. It is skipped unless
`SPOILER_TEST_BASE_URL` is set. Step by step (Windows, PowerShell, from `web/`):

```powershell
# 1. Build (needs .env.local, see above)
npm run build

# 2. Start the production server on port 3100 in the background
$p = Start-Process -FilePath "npm.cmd" -ArgumentList "run","start","--","-p","3100" -PassThru -WindowStyle Hidden

# 3. Wait until it answers
do { Start-Sleep -Seconds 1; try { $up = (Invoke-WebRequest http://localhost:3100/robots.txt -UseBasicParsing).StatusCode -eq 200 } catch { $up = $false } } until ($up)

# 4. Run the live suite
$env:SPOILER_TEST_BASE_URL = "http://localhost:3100"
npx vitest run tests/spoiler
Remove-Item Env:SPOILER_TEST_BASE_URL

# 5. Stop the whole process tree (npm.cmd starts child processes) and check the port is free
taskkill /PID $p.Id /T /F
Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue   # prints nothing
```

## Spoiler rules in code

- Only `lib/data/*` queries the database, with explicit column lists (`lib/data/columns.ts`).
  `tests/columns.test.ts` is the guard: it fails if a result column, a result table, `select *`
  or a `source_id` appears.
- Results are served only by `POST /api/reveal/[fightId]`, one fight per call, with
  `Cache-Control: no-store`.
- A fight without a score always renders as "Not rated yet". An unscored fight and a
  not-yet-rated fight must look identical.
- Page titles come from the layout `title.template` ("Blindcard – %s"; the home page uses
  `title.absolute`), and the metadata description is one fixed string from the layout.
- Run the `spoiler-check` skill before any user-facing change is called done.

## Layout

```
app/          routes: /, /events, /events/[slug], /api/reveal/[fightId], sitemap, robots, OG image
components/   CardView, FightList, FightCard, StarRating, WatchThese, RevealButton, ...
lib/card/     pure card logic: stars, sort, "Watch these", "Hidden gem", state, blurb
lib/reveal/   reveal service, response shaping, client, formatting
lib/data/     the only database access (columns, events, card, mapping, guards)
lib/supabase/ server client
tests/        vitest: unit tests, columns guard, spoiler regression (tests/spoiler)
```

## Known limits

- The data mirror refreshes about once a day, so the newest card appears hours after the event.
- The live spoiler suite is skipped by default; it only runs against a server you start yourself
  (see above).
- `OPTIONS` on the reveal route returns 204; Next handles it automatically, the route does not.
- Still to check by hand on real devices: finger tap and double-tap zoom, iOS Safari and Android
  rendering, screen reader announcements, and the focus ring colour on Reveal at rest.
