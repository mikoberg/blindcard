-- 0029: the rest of a fighter's career, for the click-gated results on the fighter page.
--
-- Our own data is the UFC since 2001; a fighter's record covers a whole career. The other bouts
-- (earlier fights, other promotions) come from the fighter's Wikipedia table and are kept here, one
-- row per bout with its outcome. A bout we store ourselves is not repeated here.
--
-- This is result data: RLS on, no policies, privileges revoked, and one narrow function that the web
-- app calls only from a POST route after a click on the fighter page (see CLAUDE.md). Written by
-- `ingest-fighters`.
--
-- Apply BEFORE deploying the web app that calls it.

create table if not exists public.fighter_bouts (
  fighter_id uuid not null references public.fighters (id) on delete cascade,
  bout_date date not null,
  opponent text not null check (opponent <> ''),
  result text not null check (result in ('win', 'loss', 'draw', 'no_contest')),
  method text,
  event_name text,
  round integer check (round is null or round between 1 and 25),
  primary key (fighter_id, bout_date, opponent)
);

alter table public.fighter_bouts enable row level security;
revoke all on public.fighter_bouts from public, anon, authenticated;

create or replace function public.fighter_other_bouts(p_slug text)
returns table (
  bout_date date,
  opponent text,
  result text,
  method text,
  event_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.bout_date, b.opponent, b.result, b.method, b.event_name
  from public.fighters me
  join public.fighter_bouts b on b.fighter_id = me.id
  where me.slug = p_slug
  order by b.bout_date desc, b.opponent
  limit 150;
$$;

revoke all on function public.fighter_other_bouts(text) from public, anon, authenticated;
grant execute on function public.fighter_other_bouts(text) to anon, authenticated;
