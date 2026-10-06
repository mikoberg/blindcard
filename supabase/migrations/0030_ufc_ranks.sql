-- 0030: the UFC ranking of each fighter going INTO a bout, shown on the cards.
--
-- `fights.ranks` is {"a": n, "b": n} for completed fights and `upcoming_bouts.fighter_a_rank` /
-- `fighter_b_rank` hold the current rank of the coming ones. 0 = champion, 1 to 15 = the place in the
-- division of the bout; a side is left out when the fighter was not ranked there.
--
-- It is the ranking in the last revision of Wikipedia's "UFC rankings" article from BEFORE the event
-- date, so it is pre-fight context of the same kind as the record going in and never says anything
-- about a result. Written by `ingest-ranks`, never by the web app.
--
-- Apply BEFORE deploying the web app that reads it.

alter table public.fights add column if not exists ranks jsonb;

alter table public.upcoming_bouts
  add column if not exists fighter_a_rank smallint check (fighter_a_rank is null or fighter_a_rank between 0 and 15),
  add column if not exists fighter_b_rank smallint check (fighter_b_rank is null or fighter_b_rank between 0 and 15);
