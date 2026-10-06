-- 0031: the facets behind the home page's card finder.
--
-- Two parts, kept apart on purpose.
--
-- 1. `event_facets` (public view): per event, counts and averages of PRE-FIGHT facts only: title
--    fights, five-round fights, women's fights, rematches, the longest win streak going in, the Elo
--    going in (average, highest, how many fights were evenly matched, the average gap), the UFC
--    ranks going in, the weight classes and the countries. Nothing here comes from a result, and
--    there is no fight count (a gap between fights and ratings would show which fights could not be
--    rated, see 0003).
--
-- 2. `event_result_facets` (private view, no grants) and `event_result_stats()`: per event, what the
--    fights turned out to be: knockouts, submissions, decisions, how long the card ran, strikes,
--    upsets by Elo, bonuses. This is result data. The view is not readable by anon or authenticated;
--    the SECURITY DEFINER function serves it (every completed event in one call, at most 1000 rows)
--    and is only called from a POST route after a click on a spoiler warning (see CLAUDE.md). An
--    event is only included when every fight of it has a result.
--
-- Apply BEFORE deploying the web app that reads it.

create or replace view public.event_facets
with (security_invoker = true) as
with sides as (
  select f.event_id,
         f.is_title_fight,
         f.scheduled_rounds,
         f.weight_class,
         (f.elo -> 'a' ->> 'r')::numeric as ra,
         (f.elo -> 'a' ->> 'n')::int as na,
         (f.elo -> 'b' ->> 'r')::numeric as rb,
         (f.elo -> 'b' ->> 'n')::int as nb,
         (f.ranks ->> 'a')::int as ka,
         (f.ranks ->> 'b')::int as kb,
         coalesce((f.career ->> 'meetings')::int, 0) as meetings,
         greatest(
           coalesce((f.career -> 'a' ->> 'streak')::int, 0),
           coalesce((f.career -> 'b' ->> 'streak')::int, 0)
         ) as streak,
         fa.country as country_a,
         fb.country as country_b
  from public.fights f
  join public.fighters fa on fa.id = f.fighter_a_id
  join public.fighters fb on fb.id = f.fighter_b_id
),
countries as (
  select event_id, array_agg(distinct c order by c) as countries
  from (
    select event_id, country_a as c from sides
    union all
    select event_id, country_b from sides
  ) t
  where c is not null
  group by event_id
)
select s.event_id,
       count(*) filter (where s.is_title_fight)::int as title_fights,
       count(*) filter (where s.scheduled_rounds = 5)::int as five_round_fights,
       count(*) filter (where s.weight_class ilike 'women%')::int as womens_fights,
       count(*) filter (where s.meetings > 0)::int as rematches,
       max(s.streak)::int as longest_streak,
       count(*) filter (where s.na >= 5 and s.nb >= 5 and abs(s.ra - s.rb) < 50)::int as even_fights,
       round(avg(abs(s.ra - s.rb)) filter (where s.na >= 5 and s.nb >= 5))::int as elo_gap_avg,
       round(
         (coalesce(sum(s.ra) filter (where s.na >= 5), 0) + coalesce(sum(s.rb) filter (where s.nb >= 5), 0))
         / nullif(count(*) filter (where s.na >= 5) + count(*) filter (where s.nb >= 5), 0)
       )::int as elo_avg,
       round(greatest(max(s.ra) filter (where s.na >= 5), max(s.rb) filter (where s.nb >= 5)))::int as elo_peak,
       (count(s.ka) + count(s.kb))::int as ranked_fighters,
       (count(*) filter (where s.ka = 0) + count(*) filter (where s.kb = 0))::int as champions,
       (count(*) filter (where s.ka between 1 and 5) + count(*) filter (where s.kb between 1 and 5))::int
         as top5_fighters,
       count(*) filter (where s.ka is not null and s.kb is not null)::int as ranked_bouts,
       coalesce(array_agg(distinct s.weight_class) filter (where s.weight_class is not null), '{}')
         as weight_classes,
       coalesce(c.countries, '{}') as countries
from sides s
left join countries c on c.event_id = s.event_id
group by s.event_id, c.countries;

revoke all on public.event_facets from public, anon, authenticated;
grant select on public.event_facets to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Result data from here on: nothing below is readable except through event_result_stats().

create or replace view public.event_result_facets as
with per_fight as (
  select f.id as fight_id,
         f.event_id,
         f.fighter_a_id,
         (f.elo -> 'a' ->> 'r')::numeric as ra,
         (f.elo -> 'a' ->> 'n')::int as na,
         (f.elo -> 'b' ->> 'r')::numeric as rb,
         (f.elo -> 'b' ->> 'n')::int as nb,
         r.method,
         r.winner_fighter_id,
         (r.end_round - 1) * 300 + r.end_time_seconds as seconds,
         r.end_round,
         coalesce(array_length(r.bonuses, 1), 0) as bonuses
  from public.fights f
  join public.fight_results r on r.fight_id = f.id
),
rounds as (
  select fight_id,
         sum(knockdowns)::int as knockdowns,
         sum(sig_strikes_landed)::int as strikes,
         sum(takedowns_landed)::int as takedowns,
         sum(sub_attempts)::int as sub_attempts,
         sum(control_seconds)::int as control_seconds
  from public.fight_rounds
  group by fight_id
),
cards as (
  select event_id, count(*) as fights from public.fights group by event_id
)
select p.event_id,
       count(*)::int as fights,
       count(*) filter (where p.method = 'KO/TKO')::int as knockouts,
       count(*) filter (where p.method = 'Submission')::int as submissions,
       count(*) filter (where p.method like 'Decision%')::int as decisions,
       count(*) filter (where p.method = 'Decision - Split')::int as split_decisions,
       count(*) filter (where p.method in ('KO/TKO', 'Submission') and p.end_round = 1)::int
         as round_one_finishes,
       sum(p.seconds)::int as total_seconds,
       max(p.seconds)::int as longest_seconds,
       min(p.seconds) filter (where p.method in ('KO/TKO', 'Submission'))::int as fastest_finish_seconds,
       sum(p.bonuses)::int as bonuses,
       count(*) filter (
         where p.winner_fighter_id is not null
           and p.na >= 5 and p.nb >= 5
           and ((p.winner_fighter_id = p.fighter_a_id and p.ra <= p.rb - 50)
             or (p.winner_fighter_id <> p.fighter_a_id and p.rb <= p.ra - 50))
       )::int as upsets,
       coalesce(sum(r.knockdowns), 0)::int as knockdowns,
       coalesce(sum(r.strikes), 0)::int as strikes,
       coalesce(sum(r.takedowns), 0)::int as takedowns,
       coalesce(sum(r.sub_attempts), 0)::int as sub_attempts,
       coalesce(sum(r.control_seconds), 0)::int as control_seconds
from per_fight p
join cards c on c.event_id = p.event_id
left join rounds r on r.fight_id = p.fight_id
group by p.event_id, c.fights
having count(*) = c.fights;

revoke all on public.event_result_facets from public, anon, authenticated;

create or replace function public.event_result_stats()
returns table (
  event_id uuid,
  fights int,
  knockouts int,
  submissions int,
  decisions int,
  split_decisions int,
  round_one_finishes int,
  total_seconds int,
  longest_seconds int,
  fastest_finish_seconds int,
  bonuses int,
  upsets int,
  knockdowns int,
  strikes int,
  takedowns int,
  sub_attempts int,
  control_seconds int
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.event_result_facets order by event_id limit 1000;
$$;

revoke all on function public.event_result_stats() from public, anon, authenticated;
grant execute on function public.event_result_stats() to anon, authenticated;
