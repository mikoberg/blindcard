-- 0032: the card finder has no result-based filters after all.
--
-- 0031 created a private view of what every event's fights turned out to be and a SECURITY DEFINER
-- function that served it. Nothing reads them any more, and result data nobody uses should not sit
-- behind a function either, so both go. `event_facets` (public, pre-fight facts only) stays.

drop function if exists public.event_result_stats();
drop view if exists public.event_result_facets;
