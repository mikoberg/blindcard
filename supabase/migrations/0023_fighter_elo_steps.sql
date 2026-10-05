-- 0023: the calculation behind each fighter's Elo rating (a click on a fighter of the Elo page).
--
-- One private row per fight of every fighter on the board, with every number of the calculation:
-- the rating before, the opponent's, the expected score, K, what the fight counted as, the change
-- and the rating after. It names fights and how they were decided, so it follows the same rule as
-- the board (0022): RLS on, no policies, privileges revoked, one narrow function, called only from a
-- POST route after a click on that fighter.
--
-- Also: Elo now counts draws and gives partial credit for split and majority decisions (see
-- ingest/src/blindcard_ingest/predict/elo_board.py), so the board is recomputed with version 2.
--
-- Apply BEFORE deploying the web app that calls it.

create table if not exists public.fighter_elo_steps (
  fighter_id uuid not null references public.fighter_elo (fighter_id) on delete cascade,
  seq integer not null check (seq > 0),
  fight_id uuid not null references public.fights (id) on delete cascade,
  fight_date date not null,
  opponent_id uuid not null references public.fighters (id) on delete cascade,
  score numeric(4, 3) not null check (score between 0 and 1),
  how text not null,
  rating_before numeric(6, 1) not null,
  opponent_rating numeric(6, 1) not null,
  expected numeric(5, 4) not null check (expected between 0 and 1),
  k numeric(5, 1) not null,
  change numeric(6, 1) not null,
  rating_after numeric(6, 1) not null,
  primary key (fighter_id, seq)
);

alter table public.fighter_elo_steps enable row level security;
revoke all on public.fighter_elo_steps from public, anon, authenticated;

-- The newest fights first, at most 120, for a fighter on the board.
create or replace function public.elo_fighter_history(p_slug text)
returns table (
  seq integer,
  fight_date date,
  event_name text,
  opponent_name text,
  opponent_slug text,
  score numeric,
  how text,
  rating_before numeric,
  opponent_rating numeric,
  expected numeric,
  k numeric,
  change numeric,
  rating_after numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.seq, s.fight_date, ev.name, o.name, o.slug, s.score, s.how,
         s.rating_before, s.opponent_rating, s.expected, s.k, s.change, s.rating_after
  from public.fighters me
  join public.fighter_elo_steps s on s.fighter_id = me.id
  join public.fights f on f.id = s.fight_id
  join public.events ev on ev.id = f.event_id
  join public.fighters o on o.id = s.opponent_id
  where me.slug = p_slug
  order by s.seq desc
  limit 120;
$$;

revoke all on function public.elo_fighter_history(text) from public, anon, authenticated;
grant execute on function public.elo_fighter_history(text) to anon, authenticated;
