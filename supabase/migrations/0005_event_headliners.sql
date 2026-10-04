-- 0005: the main event of each event in the homepage overview, for the typographic posters.
--
-- Public, pre-fight facts only: the two fighters of card position 1 (in the same a/b order as
-- everywhere else, which follows a source id and never the result) and whether it was a title
-- fight. Added at the end of event_overview, whose other columns stay as they were.

create or replace view public.event_overview
with (security_invoker = true) as
select
  e.id,
  e.slug,
  e.name,
  e.event_date,
  e.location,
  coalesce(
    jsonb_agg(jsonb_build_object('p', f.card_position, 's', s.stars) order by f.card_position)
      filter (where s.stars is not null),
    '[]'::jsonb
  ) as ratings,
  (select fa.name
     from public.fights h
     join public.fighters fa on fa.id = h.fighter_a_id
    where h.event_id = e.id
    order by h.card_position limit 1) as main_event_a,
  (select fb.name
     from public.fights h
     join public.fighters fb on fb.id = h.fighter_b_id
    where h.event_id = e.id
    order by h.card_position limit 1) as main_event_b,
  (select h.is_title_fight
     from public.fights h
    where h.event_id = e.id
    order by h.card_position limit 1) as main_event_title
from public.events e
join public.fights f on f.event_id = e.id
left join public.excitement_scores s
  on s.fight_id = f.id
 and s.version = (select v.version from public.scoring_versions v where v.is_active)
group by e.id;

revoke all on public.event_overview from public, anon, authenticated;
grant select on public.event_overview to anon, authenticated;
