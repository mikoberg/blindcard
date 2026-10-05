-- 0008: one public row per fighter with how their rated fights score, for the fighter leaderboard.
--
-- Only the ACTIVE version's star ratings of the fighter's fights: how many were rated and the
-- average. No percentile, no result data, no per-fight rows, no records. The view runs with the
-- caller's rights (security_invoker), so the active-version rule of excitement_scores applies on
-- top of the explicit join below. Fighters without a rated fight are left out.
--
-- Apply this migration BEFORE deploying the web app that reads it: /fighters depends on it.

create or replace view public.fighter_ratings
with (security_invoker = true) as
with rated as (
  select f.fighter_a_id as fighter_id, s.stars
  from public.fights f
  join public.excitement_scores s
    on s.fight_id = f.id
   and s.version = (select v.version from public.scoring_versions v where v.is_active)
  union all
  select f.fighter_b_id, s.stars
  from public.fights f
  join public.excitement_scores s
    on s.fight_id = f.id
   and s.version = (select v.version from public.scoring_versions v where v.is_active)
)
select
  fr.id,
  fr.name,
  fr.country,
  count(*)::int as rated_fights,
  round(avg(rated.stars), 2) as avg_stars
from rated
join public.fighters fr on fr.id = rated.fighter_id
group by fr.id;

revoke all on public.fighter_ratings from public, anon, authenticated;
grant select on public.fighter_ratings to anon, authenticated;
