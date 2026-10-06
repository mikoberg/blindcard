-- 0034: career totals of how a fighter's UFC fights ended, for ordering the fighters list.
--
-- `fighters.tally` is {"fights","wins","ko","sub","dec","r1","title","kd","sig","td","sa"}: UFC fights in
-- our data with a result, wins by knockout / submission / decision, finishes in round one, title fights,
-- and the knockdowns, significant strikes, takedowns and submission attempts the fighter landed or tried.
-- It is written by `compute-elo` (never by the web app) from the private result tables.
--
-- Like `record`, `elo` and `awards` it is ONE career total as of today (it includes the latest event),
-- shown on the fighters list as the number the list is ordered by, never fight by fight (see CLAUDE.md).
--
-- Apply BEFORE deploying the web app that reads it.

alter table public.fighters add column if not exists tally jsonb;
