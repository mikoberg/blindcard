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
- Upcoming events (`/upcoming/[slug]`, tables `upcoming_events` / `upcoming_bouts`) hold pre-fight facts only: names, weight class, part of the card. Never read an article on or after its event date, refuse a card that already shows a result, and show no record, streak or "unbeaten" on an upcoming card (a current record shows how the last fight went).
- Explicit exception (upcoming picks): who is favoured in an upcoming bout is learned from past results, so it sits in the private `upcoming_picks` table, is served only by `upcoming_pick` (one bout per call) through a POST-only route, and loads only after a click on a button. It is never part of a page render, is symmetric in the two fighters, is refused unless a walk-forward test clearly beats a coin, and goes when the bout goes (the day after the event). The expected rating (public data only) is not a result and stays on the page.
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
