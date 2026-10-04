# Blindcard Phase 2: web app (design)

Date: 2026-10-04. Status: design approved in conversation, spec awaiting review.

## 1. Goal

A fan opens Blindcard the morning after a card and sees, in seconds, which fights are worth
watching, including hidden gems on the undercard, without learning any result. Results stay
behind an explicit per-fight Reveal. Phase 2 is the public read side only.

Understanding (agreed):

- Public site in English. Dark, sporty, clean visual style, mobile first.
- Homepage is the latest event's card, directly.
- Fight blurbs are templates built from pre-fight facts only. No generated text.
- Next.js (App Router, TypeScript, Tailwind), server-rendered, hosted on Vercel.
- The spoiler rule in `CLAUDE.md` is binding. The legal guardrails apply (no "UFC"/"Octagon"
  in branding, no fighter photos, required footer).

Out of scope for Phase 2: accounts, user ratings and the Bayesian blend (Phase 3), the ML score
(Phase 4), fighter pages, search, upcoming events, translations, analytics, per-event OG images,
rate limiting.

## 2. Architecture

Approach A (chosen): server components read public tables with the **anon key**
(`@supabase/supabase-js`); the browser reveals through a Next route handler that calls the
database function `reveal_fight`. No service-role key exists anywhere in `/web`.
Rejected: service-role everywhere (bypasses RLS; one bug leaks all results) and calling the
RPC straight from the browser (no `no-store`, logging or rate-limit point).

```
web/
  app/
    layout.tsx, globals.css, not-found.tsx, error.tsx, sitemap.ts, robots.ts
    page.tsx                         latest event card
    events/page.tsx                  all events
    events/[slug]/page.tsx           card page
    api/reveal/[fightId]/route.ts    POST only
  lib/
    config.ts                        thresholds (watch, hidden gem, revalidate)
    supabase/server.ts               anon client, server only
    data/events.ts, data/card.ts     the only code that queries; explicit column lists
    card/blurb.ts, watchThese.ts, hiddenGem.ts, sort.ts, stars.ts    pure functions
    reveal/format.ts                 formats a reveal response for display
  components/ StarRating, FightCard, WatchThese, EventHeader, Footer, RevealButton (client)
  tests/
```

Rendering: card and list pages are server-rendered and revalidated every 300 s. The reveal
route is dynamic and answers with `Cache-Control: no-store`.

## 3. Pages and behaviour

### Routes

- `/`: the card of the most recent event in the database, rendered by the same code as the card
  page. It shows the event date prominently, and its canonical URL is `/events/[slug]`.
- `/events`: all events, newest first: name, date, location. No score or result of any kind.
- `/events/[slug]`: the card page. Unknown slug: not-found page.
- Event slugs come from the event name (a plain pre-fight fact). There are no fight URLs.

### Card page

- **Header:** event name, date, location.
- **Watch these:** up to 3 fights with stars >= 4.0, ordered by stars desc, then percentile
  desc, then card position asc. If none qualify: "No standout fights on this card".
- **Full card:** all fights in card order (position 1 = main event first). One toggle: "Sort by
  rating" (stars desc, percentile desc, card position asc; unrated fights last). No other
  sort exists, because any other would leak duration or method.
- **Fight card:** the two fighter names, weight class, title badge, scheduled rounds, stars
  (icons, number, and `aria-label` "Rated 4.5 out of 5"), the blurb, and a Reveal button.
- **Hidden gem badge:** a fight with stars >= 4.0 and card position >= 6. Derived only from
  stars and position; thresholds live in `lib/config.ts`.
- **Fighter order:** exactly `fighter_a`, `fighter_b` from the database (decided by a rule
  independent of the result). Never reordered in the UI.
- **Unrated fights:** shown as "Not rated yet". Fights not yet processed and fights that cannot
  be scored render identically. If no fight on the event has a score: a banner "Ratings are on
  their way".
- Scores come from the active scoring version (`scoring_versions.is_active`). No active version:
  everything is "Not rated yet".

### Blurb templates

Inputs are pre-fight facts only: card position, title flag, weight class, scheduled rounds.

- Role: position 1 "Main event", position 2 "Co-main event", otherwise none.
- Subject: title fight -> "{weight class} title fight" (or "Title fight" if the class is
  unknown); otherwise "{weight class} bout" (or "Bout").
- Rounds: "scheduled for {three|five|N} rounds" when known; omitted when unknown.
- Output: "{Role}. {Subject}, scheduled for {rounds}." e.g. "Main event. Lightweight title
  fight, scheduled for five rounds." and "Women's Strawweight bout, scheduled for three rounds."
- A test asserts that no output over all input combinations contains any word from the
  `spoiler-check` list ("finish", "knockout", "submission", "decision", "upset", "comeback",
  "dominant", "survived").

### Reveal

- One button per fight. Click -> `POST /api/reveal/{fightId}` -> that one fight's result is
  shown inside that card only: winner (mapped from `winner_fighter_id` to the two names already
  on the page), method and detail, round and time, and scorecards for decisions. Draw and no
  contest are shown as such.
- The button can hide the result again. Revealed state lives only in component memory: not in
  the URL, not in storage. Revealing one fight never reveals another.
- Loading and error states: "Couldn't load the result. Try again."
- The client component receives only the fight id and the two fighters' ids and names as props.

### Reveal route

- `POST` only; any other method: 405. No list or bulk endpoint exists.
- Validates the id as a UUID (400), calls `reveal_fight`, 0 rows -> 404 with a generic body, 1
  row -> JSON `{outcome, winnerFighterId, method, methodDetail, endRound, endTimeSeconds,
  scorecards, bonuses}`.
- Headers: `Cache-Control: no-store`. Logs hold the fight id and the status only.

### Metadata, legal, accessibility

- Title "Blindcard – {event name}"; fixed description ("Which fights are worth watching, with
  no spoilers"); one static OG image; sitemap lists events only. No result in any tag or slug.
- Footer, on every page: "Unofficial fan project, not affiliated with any promotion."
- "UFC" appears only inside event names as a plain fact, never in logo, title or site copy.
- Dark theme with design tokens (CSS variables) and one accent colour; contrast >= 4.5:1;
  visible focus; `prefers-reduced-motion` honoured; usable at phone width; fonts via
  `next/font`; star icons as inline SVG. Visual detail is worked out with the
  `frontend-design` skill during the build.

## 4. Data layer

`lib/data/*` is the only code that queries. Every query lists its columns:

- events: `id, name, slug, event_date, location`
- fights: `id, event_id, card_position, weight_class, is_title_fight, scheduled_rounds,
  fighter_a_id, fighter_b_id`
- fighters: `id, name`
- excitement_scores: `fight_id, stars, percentile` for the active version

Never selected: `source`, `source_id` (a source id points at the third-party results page),
anything from `fight_results`, `fight_rounds`, `excitement_features`.

Environment (`web/.env.local`, with a committed `.env.example`):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (dev project first).

Failures: a database error shows the friendly error page; no stack traces or SQL in the
response or in the client bundle.

## 5. Spoiler guarantees (automated)

1. **Column allowlist test:** the data layer's query strings contain none of the forbidden
   names (result tables, `winner`, `method`, `end_round`, `source_id`, ...).
2. **Rendered-output regression test:** build and start the app against the dev database, fetch
   `/`, `/events` and a card page (HTML and the Next data payload) and assert they contain none
   of: the event's `method`, `method_detail`, scorecard strings, finish time, bonuses, nor
   `fight_results`, `end_round`, `winner`. (Fighter names and ids are present by design, so a
   name-based check is not possible; this guards everything else.)
3. **Reveal route tests:** exactly one fight per call; 400 on a bad id; 404 on an unknown
   fight; `no-store`; 405 for GET; no list endpoint.
4. **Pure-logic tests:** blurb words, watch-these rule, hidden gem, sorting, star display,
   reveal formatting, "Not rated yet" behaviour.
5. The `spoiler-check` skill runs before any user-facing change is called done.

## 6. Dependencies

- Stack (agreed): Next.js, React, TypeScript, Tailwind.
- Approved: `@supabase/supabase-js`; `vitest` (dev only).
- Not added without asking: `server-only` (tiny Next-maintained marker package; the alternative
  is keeping the rule by convention and test), any UI or icon library, any e2e framework.
- Before using caching/ISR APIs, read the docs of the installed Next.js version; they changed
  between releases.

## 7. Build order (test after each step)

1. Scaffold `web/` and prove a clean build.
2. Pure logic with tests (blurb, watch these, hidden gem, sort, stars, reveal formatting).
3. Data layer, types and the column allowlist test.
4. Reveal route with tests.
5. Pages and visual design (home, events, card).
6. Rendered-output spoiler regression test against dev; run `spoiler-check`.
7. Mobile and accessibility pass.
8. `web/README.md`.

Prerequisites: `backfill` and `rescore --version 1` finished on the dev project (scores exist);
the dev project URL and anon key in `web/.env.local`.

## 8. Known limits and open items

- The data mirror refreshes about once a day (around 18:04 UTC), so the newest card appears on
  the site hours after the event, not the morning after. The homepage shows the event date so
  freshness is visible. A faster source is a separate decision.
- A fight without a score is itself a visible signal if rendered differently; the rule is to
  render it exactly as "Not rated yet" (section 3).
- The star rating carries some outcome signal by nature; features stay private.
- Fighters are keyed by name, so a few homonyms merge into one fighter; harmless without
  fighter pages.
- To decide at plan time: domain and site name artwork, the static OG image asset, adding
  `server-only`, the Vercel project (after the production Supabase project exists), rate
  limiting.
