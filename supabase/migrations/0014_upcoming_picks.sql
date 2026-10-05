-- 0014: who is favoured in an upcoming bout, behind an explicit click.
--
-- A favourite is learned from past RESULTS (Elo-style), so it is kept as private as result data:
-- the table has RLS on, no policies and no grants, and the only way out is `upcoming_pick`, one
-- bout per call, from a POST route after a click on a button. It is a pre-fight guess about a bout
-- that has not been fought, symmetric in the two fighters, and never part of a page render. Rows
-- go when their bout goes (the day after the event), so a pick is never shown next to the result.
--
-- `upcoming_bouts.has_pick` is public (a pick exists for this bout) so the page only offers the
-- button where there is something behind it; it says nothing about who is favoured.
--
-- Apply this migration BEFORE deploying the web app that reads it.

alter table public.upcoming_bouts add column has_pick boolean not null default false;

create table public.upcoming_picks (
  bout_id uuid primary key references public.upcoming_bouts (id) on delete cascade,
  -- the fighter listed first ('a') or second ('b') on the bout
  favoured text not null check (favoured in ('a', 'b')),
  probability numeric(4, 3) not null check (probability between 0.5 and 1),
  -- how many of the two fighters have earlier results to go on
  basis text not null check (basis in ('both', 'one')),
  -- how often this kind of pick was right on past fights (walk-forward)
  accuracy numeric(4, 3) not null check (accuracy between 0 and 1),
  version integer not null
);

alter table public.upcoming_picks enable row level security;
revoke all on public.upcoming_picks from public, anon, authenticated;

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
  where p.bout_id = p_bout_id;
$$;

revoke all on function public.upcoming_pick(uuid) from public, anon, authenticated;
grant execute on function public.upcoming_pick(uuid) to anon, authenticated;
