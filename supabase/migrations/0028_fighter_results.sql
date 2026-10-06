-- 0028: who a fighter beat and lost to, for the click-gated results on a fighter page.
--
-- This is result data: how every fight of one fighter ended. It follows the rule for result data:
-- it stays in the private tables and is served by one narrow SECURITY DEFINER function, one fighter
-- per call, called only from a POST route after a click on the fighter page (see CLAUDE.md). It
-- lists at most the 120 newest fights.
--
-- Apply BEFORE deploying the web app that calls it.

create or replace function public.fighter_results(p_slug text)
returns table (
  fight_id uuid,
  result text,
  method text
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id,
         case
           when r.outcome = 'draw' then 'draw'
           when r.winner_fighter_id = me.id then 'win'
           when r.winner_fighter_id is not null then 'loss'
           else 'no_contest'
         end,
         r.method
  from public.fighters me
  join public.fights f on f.fighter_a_id = me.id or f.fighter_b_id = me.id
  join public.events e on e.id = f.event_id
  join public.fight_results r on r.fight_id = f.id
  where me.slug = p_slug
  order by e.event_date desc, f.card_position
  limit 120;
$$;

revoke all on function public.fighter_results(text) from public, anon, authenticated;
grant execute on function public.fighter_results(text) to anon, authenticated;
