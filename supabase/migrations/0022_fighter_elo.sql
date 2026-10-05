-- 0022: the Elo leaderboard ("Strongest fighters", a spoiler page).
--
-- An Elo rating is built from who beat whom, so the list says who won recently. It is result-derived
-- data and follows the rule for result data: a private table (RLS on, no policies, privileges
-- revoked) and one narrow function that the web app calls only from a POST route, after a click on a
-- page that says it contains spoilers. Nothing of it is part of any page render.
--
-- The function lists only fighters who fought in the last two years (the board is about who is
-- strong now, and a retired fighter's rating never moves) and at most 100 rows.
--
-- Apply BEFORE deploying the web app that calls it.

create table if not exists public.fighter_elo (
  fighter_id uuid primary key references public.fighters (id) on delete cascade,
  rating numeric(6, 1) not null,
  fights integer not null check (fights > 0),
  last_fight date not null,
  version integer not null,
  computed_at timestamptz not null default now()
);

alter table public.fighter_elo enable row level security;
revoke all on public.fighter_elo from public, anon, authenticated;

create or replace function public.elo_leaderboard(p_limit integer default 50)
returns table (
  rank integer,
  name text,
  slug text,
  country text,
  rating numeric,
  fights integer,
  last_fight date
)
language sql
stable
security definer
set search_path = ''
as $$
  select (row_number() over (order by e.rating desc, f.id))::integer as rank,
         f.name, f.slug, f.country, e.rating, e.fights, e.last_fight
  from public.fighter_elo e
  join public.fighters f on f.id = e.fighter_id
  where e.last_fight >= current_date - 730
  order by e.rating desc, f.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.elo_leaderboard(integer) from public, anon, authenticated;
grant execute on function public.elo_leaderboard(integer) to anon, authenticated;
