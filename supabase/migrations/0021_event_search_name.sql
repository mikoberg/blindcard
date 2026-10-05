-- 0021: event search that ignores case, accents and punctuation, like the fighter search (0020).
--
-- A stored, generated column holds the folded event name (public.fold_name), for completed and for
-- announced events, so "prochazka" finds "Prochazka vs. Stirling" and "van pantoja" finds
-- "Van vs. Pantoja 2". Generated columns are computed by the database: ingest does not write them.
--
-- Apply BEFORE deploying the web app that searches on it (/api/search returns 503 without it).

alter table public.events
  add column if not exists search_name text generated always as (public.fold_name(name)) stored;

alter table public.upcoming_events
  add column if not exists search_name text generated always as (public.fold_name(name)) stored;
