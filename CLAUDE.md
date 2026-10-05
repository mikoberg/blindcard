# Blindcard

Spoiler-free fight rating site. Fans see which fights on a card are worth watching without learning results.

## Structure
- `/ingest`: Python 3.12 scrapers, scoring, CLI (`pytest` for tests)
- `/web`: Next.js App Router + TypeScript + Tailwind
- `/supabase/migrations`: Postgres schema (Supabase)
- `/ml`: future excitement model

## The spoiler rule (most important)
Public card views must never expose, directly or indirectly: winner, method, round, finish time, fight duration, bonuses (Fight/Performance of the Night), scorecards, or post-fight records.
- Result data lives in `fight_results`, separated by RLS. It's only served through the explicit reveal path.
- This also covers page titles, meta/OG tags, URL slugs, alt text, blurbs, API responses, logs shipped to the client, and sort orders other than rating.
- Explicit exception (judge pages): a judge's most disputed scorecards (max 10, any date) name fights, official results and all three cards. They sit in the private `judge_disputes` table, are served only by `judge_disputed_cards` through a POST-only route, and load only after a click on a button with a warning next to it. They are never part of a page render, and judge pages otherwise show totals only.
- Start times of upcoming events come from the official event page (cited by the Wikipedia article): only three UTC timestamps are read, robots.txt is checked first and its crawl delay (15 s) is honoured, and only events within 45 days are read. Never widen what is read from that page: it holds the card and, after the event, its results.
- Fighting styles (`fighters.style`, shown on every card) come from the fighter's Wikipedia page (infobox style and belts) and, where that has nothing, one field of the official athlete page, read slowly (robots.txt checked, 15 s crawl delay, at most 40 per run, each fighter marked so they are not asked again for months). Fixed list of labels only. Display only: no prediction uses style.
- Upcoming events (`/upcoming/[slug]`, tables `upcoming_events` / `upcoming_bouts`) hold pre-fight facts only: names, weight class, part of the card. Never read an article on or after its event date, refuse a card that already shows a result, and an upcoming card shows each fighter's record going into the bout (today's record, computed from the going-in record of their latest completed fight plus its result, and left out when either is unknown), exactly as completed cards show the record going in; it shows no streak note, rating of the fight or result. Known and accepted: two consecutive records differ by the result in between.
- Explicit exception (upcoming picks): who is favoured in an upcoming bout is learned from past results, so it sits in the private `upcoming_picks` table, is served only by `upcoming_pick` (one bout per call) through a POST-only route, and loads only after a click on a button. It is never part of a page render, is symmetric in the two fighters, is refused unless a walk-forward test clearly beats a coin, and goes when the bout goes (the day after the event). The expected rating (public data only) is not a result and stays on the page.
- Explicit exception (Elo leaderboard, `/fighters/elo`): an Elo rating is built from who beat whom, so the list says how recent fights went. It sits in the private `fighter_elo` table, is served only by `elo_leaderboard` (active fighters with at least 8 fights, at most 100 rows) through a POST-only route, and loads only after a click on a button with a spoiler warning above it. The calculation behind one fighter's rating (every fight, opponent, how it was decided, expected score, K and change) sits in `fighter_elo_steps`, is served only by `elo_fighter_history` (one fighter per call, at most 120 rows) through a POST-only route, and loads only when that fighter is opened on the Elo page. The page itself (title, description, text) carries no result and never names a fighter; it is not linked from any card or card view, only from the fighters page with a warning. Never sort or show Elo anywhere else.
- Run the `spoiler-check` skill before finishing any user-facing change.

## Legal guardrails
- Never use "UFC", "Octagon" or UFC logos in branding. Event and fighter names as plain facts are fine.
- No fighter photos or official imagery.
- Footer: "Unofficial fan project, not affiliated with any promotion."
- Scrape politely (~1 req/s, identifying user agent, cache raw HTML) and only what we need.

## Conventions
- Complete files over partial diffs; production-ready code (types, error handling, logging).
- Scoring weights live in config, not in code. Scores are versioned.
- Ask before adding dependencies outside the agreed stack.
- Times are stored in UTC and displayed in the user's timezone (default Europe/Amsterdam).
