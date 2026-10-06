-- 0033: how many Fight of the Night and Performance of the Night bonuses a fighter has earned.
--
-- `fighters.awards` is {"fotn": n, "potn": n}, written by `ingest-bonuses` (never by the web app).
-- The labels are per FIGHT in the private `fight_results.bonuses`; this is the career total per
-- fighter: a Fight of the Night counts for both fighters, a Performance of the Night for the winner of
-- that fight. Only fights of events whose awards we hold are counted (Wikipedia has them from 2015 on),
-- and a fighter without a fight in such an event has none (null), so nothing reads as "0" by lack of data.
--
-- It is a current-standing fact of the same kind as `record` and `elo` on the fighter page: one total as
-- of today, never fight by fight, and it includes the latest event (see CLAUDE.md).
--
-- Apply BEFORE deploying the web app that reads it.

alter table public.fighters add column if not exists awards jsonb;
