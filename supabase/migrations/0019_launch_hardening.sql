-- 0019: two hardening steps found in the pre-launch audit.
--
-- 1. `ratings` (a visitor's own star rating, a Phase 3 feature with no UI yet) was granted to every
--    signed-in user. Anyone who could create an account with the public key could write to it.
--    Closed until the feature exists: no grants for anon or authenticated. The table and its
--    own-rows policies stay, so the feature can be switched on by granting access again.
--
-- 2. `upcoming_pick` had no date guard: a pick stayed readable until the next ingest deleted the
--    bout, and could be read after the fight if the cron was down. It now answers only while the
--    event is still ahead (today included), like the pages do.
--
-- Apply this migration BEFORE deploying the web app that depends on it.

revoke all on public.ratings from public, anon, authenticated;

create or replace function public.upcoming_pick(p_bout_id uuid)
returns table (
  bout_id uuid,
  favoured text,
  probability numeric,
  basis text,
  accuracy numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.bout_id, p.favoured, p.probability, p.basis, p.accuracy
  from public.upcoming_picks p
  join public.upcoming_bouts b on b.id = p.bout_id
  join public.upcoming_events e on e.id = b.event_id
  where p.bout_id = p_bout_id
    and e.event_date >= current_date;
$$;

revoke all on function public.upcoming_pick(uuid) from public, anon, authenticated;
grant execute on function public.upcoming_pick(uuid) to anon, authenticated;
