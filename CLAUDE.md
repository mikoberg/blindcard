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
