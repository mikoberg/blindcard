-- 0027: more on the fighter page: today's record and Elo, and a little more per rated fight.
--
-- * `fighters.record` is {"w","l","d","nc"} as of today (the record going into their latest
--   completed fight plus its result) and `fighters.elo` is {"r": rating, "n": fights} as of today.
--   Both are written by `compute-elo`, never by the web app, and only for fighters where they are
--   reliable. They are "as of today" facts of the same kind as the record and Elo on an announced
--   bout, so they include the fighter's latest fight; they are shown on the fighter page only as a
--   current standing, never fight by fight (see CLAUDE.md).
-- * `fighter_fights` gains the fight (for a link to its place on the card), its weight class, whether
--   it was a title fight and the opponent's page. All of it is pre-fight, public card data.
--
-- Same views as before with columns added at the end. Apply BEFORE deploying the web app.

alter table public.fighters
  add column if not exists record jsonb,
  add column if not exists elo jsonb;

create or replace view public.fighter_fights
with (security_invoker = true) as
select
  fr.slug as fighter_slug,
  e.slug as event_slug,
  e.name as event_name,
  e.event_date,
  opp.name as opponent_name,
  s.stars,
  f.id as fight_id,
  f.weight_class,
  f.is_title_fight,
  opp.slug as opponent_slug
from public.fights f
join public.events e on e.id = f.event_id
join public.excitement_scores s
  on s.fight_id = f.id
 and s.version = (select v.version from public.scoring_versions v where v.is_active)
cross join lateral (
  values (f.fighter_a_id, f.fighter_b_id), (f.fighter_b_id, f.fighter_a_id)
) as sides(fighter_id, opponent_id)
join public.fighters fr on fr.id = sides.fighter_id
join public.fighters opp on opp.id = sides.opponent_id;

revoke all on public.fighter_fights from public, anon, authenticated;
grant select on public.fighter_fights to anon, authenticated;
