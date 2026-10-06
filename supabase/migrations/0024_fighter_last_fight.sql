-- 0024: when each fighter last fought, on the public fighter list.
--
-- The fighters page can then show only active fighters (fought in the last two years) instead of
-- everyone since 2001. It is the date of the fighter's latest RATED fight: public, like every event
-- date, and no result. Same view as before with one column added at the end.
--
-- Apply BEFORE deploying the web app that reads it: /fighters depends on it.

create or replace view public.fighter_ratings
with (security_invoker = true) as
with rated as (
  select f.fighter_a_id as fighter_id, s.stars, e.event_date
  from public.fights f
  join public.events e on e.id = f.event_id
  join public.excitement_scores s
    on s.fight_id = f.id
   and s.version = (select v.version from public.scoring_versions v where v.is_active)
  union all
  select f.fighter_b_id, s.stars, e.event_date
  from public.fights f
  join public.events e on e.id = f.event_id
  join public.excitement_scores s
    on s.fight_id = f.id
   and s.version = (select v.version from public.scoring_versions v where v.is_active)
)
select
  fr.id,
  fr.name,
  fr.country,
  count(*)::int as rated_fights,
  round(avg(rated.stars), 2) as avg_stars,
  fr.slug,
  public.fold_name(fr.name) as search_name,
  max(rated.event_date) as last_fight
from rated
join public.fighters fr on fr.id = rated.fighter_id
group by fr.id;

revoke all on public.fighter_ratings from public, anon, authenticated;
grant select on public.fighter_ratings to anon, authenticated;
