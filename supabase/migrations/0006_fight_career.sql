-- 0006: what was known about the two fighters before the bout (rematch, streaks, unbeaten).
--
-- A pre-fight fact: it is built from the fighters' EARLIER bouts only, never from the bout
-- itself, so it says nothing about how this one went. Shape (a/b follow fighter_a / fighter_b):
--   {"meetings": 1, "a": {"streak": 4, "unbeaten": false}, "b": {"streak": 0, "unbeaten": true}}
-- NULL = not computed yet. Written by `blindcard-ingest ingest-context`.

alter table public.fights add column career jsonb;
