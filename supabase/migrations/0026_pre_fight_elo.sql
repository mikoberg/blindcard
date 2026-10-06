-- 0026: the Elo of each fighter going INTO a bout, shown on the cards like the record going in.
--
-- `fights.elo` is {"a": {"r": rating, "n": earlier fights}, "b": {...}} for completed fights, and
-- `upcoming_bouts.fighter_a_elo` / `fighter_b_elo` hold {"r": rating, "n": fights} for the coming
-- ones (their current rating). A side is left out when the fighter has no earlier fight in our data.
--
-- It is pre-fight data, the same kind as `fights.records`: computed from EARLIER fights only
-- (never from the fight itself), never the rating after a fight and never a change. Like two
-- consecutive records, two consecutive ratings differ by the result in between; this is known and
-- accepted (see CLAUDE.md). Written by `compute-elo`, never by the web app.
--
-- Apply BEFORE deploying the web app that reads it.

alter table public.fights add column if not exists elo jsonb;

alter table public.upcoming_bouts
  add column if not exists fighter_a_elo jsonb,
  add column if not exists fighter_b_elo jsonb;
