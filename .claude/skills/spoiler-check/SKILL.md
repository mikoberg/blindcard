---
name: spoiler-check
description: Audit a change for anything that could reveal fight results to users. Use before finishing any task that touches pages, components, API routes, database queries, metadata or generated text that users can see.
---

# Spoiler check

Blindcard's core promise is that nothing visible before an explicit Reveal hints at a fight's outcome. Audit the current change against this list and report each item as PASS, FAIL (with file and line) or N/A.

## 1. Data exposure
- Public queries and API responses never select or join `fight_results`, or fields derived from it (winner, method, round, time, duration, bonuses, scorecards).
- RLS policies still block result data from public roles.
- Fighter records (W-L-D) are shown as they stood **before** the fight, never updated post-event.
- No result data in client bundles, hydration payloads, `console.log` or error messages.

## 2. Indirect leaks
- Page titles, meta descriptions, OG/Twitter tags and share images contain no results.
- URL slugs and query params contain no results.
- Fights are ordered by card position or rating only, never by duration, finish time or method.
- No visual cue varies with outcome: badges, icons, colors, "short fight" or "went the distance" labels, bout length, number of rounds shown.
- Blurbs (written or generated) describe style, stakes and action level only. Check for words like "finish", "knockout", "submission", "decision", "upset", "comeback", "dominant", "survived".
- Corner colors and fighter display order don't follow who won.

## 3. Reveal path
- Reveal is an explicit per-fight user action, and its data loads only after the click.
- Revealing one fight doesn't reveal others on the same card.

## Output
List any FAIL items with the fix, then a one-line verdict: "Spoiler-safe" or "Not safe to ship".
