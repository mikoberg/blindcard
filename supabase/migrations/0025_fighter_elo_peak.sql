-- 0025: the highest Elo rating a fighter reached, on the Elo leaderboard.
--
-- Result-derived like the rest of the board (it follows from who beat whom), so it lives in the
-- same private table and is served by the same function after the same click. The function's
-- result type changes, so it is dropped and created again with the same privileges.
--
-- Rows written before this migration have no peak until `compute-elo` runs again; until then the
-- function shows the current rating as the peak.
--
-- Apply BEFORE deploying the web app that reads it.

alter table public.fighter_elo
  add column if not exists peak numeric(6, 1),
  add column if not exists peak_date date;

drop function if exists public.elo_leaderboard(integer);

create function public.elo_leaderboard(p_limit integer default 50)
returns table (
  rank integer,
  name text,
  slug text,
  country text,
  rating numeric,
  fights integer,
  last_fight date,
  peak numeric,
  peak_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  select (row_number() over (order by e.rating desc, f.id))::integer as rank,
         f.name, f.slug, f.country, e.rating, e.fights, e.last_fight,
         greatest(coalesce(e.peak, e.rating), e.rating) as peak,
         case when e.peak is null or e.peak <= e.rating then e.last_fight else e.peak_date end as peak_date
  from public.fighter_elo e
  join public.fighters f on f.id = e.fighter_id
  where e.last_fight >= current_date - 730
  order by e.rating desc, f.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.elo_leaderboard(integer) from public, anon, authenticated;
grant execute on function public.elo_leaderboard(integer) to anon, authenticated;
