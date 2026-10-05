-- 0012: upcoming events: the announced cards of events that have not happened yet.
--
-- Kept apart from `events` / `fights` on purpose. Those hold completed, rated fights keyed on the
-- data mirror's ids; every overview, leaderboard and card path assumes results exist. Upcoming
-- rows hold pre-fight facts only (the names, weight class and part of the card), so the tables are
-- fully public, and they can never carry a result. They are rebuilt by `ingest-upcoming` (the
-- ingest connection writes; anyone reads) and the rows of an event are deleted the day after it.
--
-- A fighter is linked to `fighters` only when exactly one stored fighter has that name. Debuts
-- stay unlinked. No record, streak or "unbeaten" is stored: a fighter's current record would
-- show how their last fight went.
--
-- Apply this migration BEFORE deploying the web app that reads it.

create table public.upcoming_events (
  id uuid primary key default gen_random_uuid(),
  wiki_title text not null unique check (wiki_title <> ''),
  name text not null check (name <> ''),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  event_date date not null,
  location text,
  updated_at timestamptz not null default now()
);

create index upcoming_events_date_idx on public.upcoming_events (event_date);

create table public.upcoming_bouts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.upcoming_events (id) on delete cascade,
  -- 1 = listed first = the main event
  card_position smallint not null check (card_position >= 1),
  segment text check (segment in ('main', 'prelim', 'early_prelim')),
  weight_class text,
  is_title_fight boolean not null default false,
  fighter_a_name text not null check (fighter_a_name <> ''),
  fighter_b_name text not null check (fighter_b_name <> ''),
  fighter_a_id uuid references public.fighters (id) on delete set null,
  fighter_b_id uuid references public.fighters (id) on delete set null,
  unique (event_id, card_position)
);

alter table public.upcoming_events enable row level security;
alter table public.upcoming_bouts enable row level security;

create policy upcoming_events_public_read on public.upcoming_events
  for select to anon, authenticated using (true);
create policy upcoming_bouts_public_read on public.upcoming_bouts
  for select to anon, authenticated using (true);

revoke all on public.upcoming_events, public.upcoming_bouts from public, anon, authenticated;
grant select on public.upcoming_events, public.upcoming_bouts to anon, authenticated;
