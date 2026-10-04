-- 0003: one public summary row per event, for the homepage overview.
--
-- Only public, pre-fight facts and the ACTIVE version's star ratings: the fights' card
-- positions and stars, in card order. No percentile, no result data. The view runs with the
-- caller's rights (security_invoker), so the active-version rule of excitement_scores applies
-- on top of the explicit join below. Events without any fight are left out.

create or replace view public.event_overview
with (security_invoker = true) as
select
  e.id,
  e.slug,
  e.name,
  e.event_date,
  e.location,
  count(f.id)::integer as fight_count,
  coalesce(
    jsonb_agg(jsonb_build_object('p', f.card_position, 's', s.stars) order by f.card_position)
      filter (where s.stars is not null),
    '[]'::jsonb
  ) as ratings
from public.events e
join public.fights f on f.event_id = e.id
left join public.excitement_scores s
  on s.fight_id = f.id
 and s.version = (select v.version from public.scoring_versions v where v.is_active)
group by e.id;

revoke all on public.event_overview from public, anon, authenticated;
grant select on public.event_overview to anon, authenticated;
