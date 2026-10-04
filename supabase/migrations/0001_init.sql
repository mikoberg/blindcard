-- Blindcard: initial schema.
--
-- SPOILER RULE: result data is isolated from public card data.
--   PUBLIC  (anon + authenticated may SELECT): events, fighters, fights,
--           scoring_versions, excitement_scores
--   PRIVATE (RLS enabled, NO policies, privileges revoked): fight_results,
--           fight_rounds, excitement_features
--   OWN ROWS: ratings
-- Results are only served through public.reveal_fight(uuid), one fight per call.
--
-- Writes happen through the ingest connection (service role / owner), which bypasses RLS.

------------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

------------------------------------------------------------------------------
-- Public card data (pre-fight facts only)
------------------------------------------------------------------------------

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  promotion   text not null default 'UFC' check (promotion <> ''),
  source      text not null check (source <> ''),
  source_id   text not null check (source_id <> ''),
  name        text not null check (name <> ''),
  slug        text not null check (slug <> ''),
  event_date  date not null,
  starts_at   timestamptz,            -- UTC; the source only gives a date, so nullable
  location    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint events_source_unique unique (source, source_id),
  constraint events_slug_unique unique (slug)
);
create index events_event_date_idx on public.events (event_date desc);
create trigger events_set_updated_at before update on public.events
  for each row execute function public.set_updated_at();

create table public.fighters (
  id          uuid primary key default gen_random_uuid(),
  source      text not null check (source <> ''),
  source_id   text not null check (source_id <> ''),
  name        text not null check (name <> ''),
  slug        text not null check (slug <> ''),
  nickname    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint fighters_source_unique unique (source, source_id),
  constraint fighters_slug_unique unique (slug)
);
-- No records (W-L-D) and no photos: the source only has post-fight records, which spoil.
create trigger fighters_set_updated_at before update on public.fighters
  for each row execute function public.set_updated_at();

create table public.fights (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events (id) on delete cascade,
  source           text not null check (source <> ''),
  source_id        text not null check (source_id <> ''),
  card_position    smallint not null check (card_position >= 1),  -- 1 = main event
  fighter_a_id     uuid not null references public.fighters (id),
  fighter_b_id     uuid not null references public.fighters (id),
  weight_class     text,
  is_title_fight   boolean not null default false,
  scheduled_rounds smallint check (scheduled_rounds between 1 and 5),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint fights_source_unique unique (source, source_id),
  constraint fights_card_position_unique unique (event_id, card_position),
  constraint fights_distinct_fighters check (fighter_a_id <> fighter_b_id)
  -- Deliberately NO winner, method, round, time or bonus columns: see fight_results.
);
create index fights_event_card_idx on public.fights (event_id, card_position);
create index fights_fighter_a_idx on public.fights (fighter_a_id);
create index fights_fighter_b_idx on public.fights (fighter_b_id);
create trigger fights_set_updated_at before update on public.fights
  for each row execute function public.set_updated_at();

-- Spoiler guard. In the source data the first-listed fighter wins far more often than the
-- second (about 63% vs 35%), so fighter order must never follow the listing order.
-- Rule: fighter_a has the smaller source_id (a stable key unrelated to the result). The
-- ingest code applies the rule; this trigger makes a bug fail loudly instead of leaking
-- results.
create or replace function public.enforce_fight_fighter_order()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  a_source_id text;
  b_source_id text;
begin
  select source_id into a_source_id from public.fighters where id = new.fighter_a_id;
  select source_id into b_source_id from public.fighters where id = new.fighter_b_id;
  if a_source_id is null or b_source_id is null
     or not (a_source_id collate "C" < b_source_id collate "C") then
    raise exception
      'fighter_a must have the smaller source_id than fighter_b (order must not depend on the result)';
  end if;
  return new;
end;
$$;
create trigger fights_fighter_order
  before insert or update of fighter_a_id, fighter_b_id on public.fights
  for each row execute function public.enforce_fight_fighter_order();

------------------------------------------------------------------------------
-- Scoring (versioned). Only stars and percentile are public.
------------------------------------------------------------------------------

create table public.scoring_versions (
  version     integer primary key check (version >= 1),
  config      jsonb not null,   -- snapshot of the weights/thresholds used
  reference   jsonb not null,   -- frozen normalisation caps + composite quantiles
  is_active   boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index scoring_versions_one_active_idx
  on public.scoring_versions (is_active) where is_active;

create table public.excitement_scores (
  fight_id    uuid not null references public.fights (id) on delete cascade,
  version     integer not null references public.scoring_versions (version),
  percentile  numeric(5, 2) not null check (percentile between 0 and 100),
  stars       numeric(2, 1) not null
              check (stars between 1.0 and 5.0 and stars * 2 = round(stars * 2)),
  computed_at timestamptz not null default now(),
  primary key (fight_id, version)
);
create index excitement_scores_version_stars_idx
  on public.excitement_scores (version, stars desc);

------------------------------------------------------------------------------
-- PRIVATE result-side data (spoilers)
------------------------------------------------------------------------------

create table public.fight_results (
  fight_id           uuid primary key references public.fights (id) on delete cascade,
  outcome            text not null check (outcome in ('win', 'draw', 'no_contest')),
  winner_fighter_id  uuid references public.fighters (id),
  method             text not null check (method <> ''),
  method_detail      text,
  end_round          smallint not null check (end_round >= 1),
  end_time_seconds   integer not null check (end_time_seconds >= 0),
  scorecards         jsonb not null default '[]'::jsonb,
  bonuses            text[] not null default '{}',   -- Fight/Performance of the Night
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint fight_results_winner_matches_outcome
    check ((outcome = 'win') = (winner_fighter_id is not null))
);
create trigger fight_results_set_updated_at before update on public.fight_results
  for each row execute function public.set_updated_at();

-- Round data is result data: the number of rows reveals how many rounds were fought and
-- per-round knockdowns hint at the outcome.
create table public.fight_rounds (
  fight_id                uuid not null references public.fights (id) on delete cascade,
  round_number            smallint not null check (round_number >= 1),
  fighter_id              uuid not null references public.fighters (id),
  knockdowns              smallint not null default 0 check (knockdowns >= 0),
  sig_strikes_landed      integer not null default 0 check (sig_strikes_landed >= 0),
  sig_strikes_attempted   integer not null default 0 check (sig_strikes_attempted >= 0),
  total_strikes_landed    integer not null default 0 check (total_strikes_landed >= 0),
  total_strikes_attempted integer not null default 0 check (total_strikes_attempted >= 0),
  takedowns_landed        smallint not null default 0 check (takedowns_landed >= 0),
  takedowns_attempted     smallint not null default 0 check (takedowns_attempted >= 0),
  sub_attempts            smallint not null default 0 check (sub_attempts >= 0),
  reversals               smallint not null default 0 check (reversals >= 0),
  control_seconds         integer not null default 0 check (control_seconds >= 0),
  primary key (fight_id, round_number, fighter_id),
  constraint fight_rounds_sig_landed_le_attempted
    check (sig_strikes_landed <= sig_strikes_attempted),
  constraint fight_rounds_total_landed_le_attempted
    check (total_strikes_landed <= total_strikes_attempted),
  constraint fight_rounds_td_landed_le_attempted
    check (takedowns_landed <= takedowns_attempted)
);

-- Score features (finish, finish timing, duration, ...) are spoilers; only the resulting
-- stars/percentile live in the public excitement_scores table.
create table public.excitement_features (
  fight_id    uuid not null references public.fights (id) on delete cascade,
  version     integer not null references public.scoring_versions (version),
  features    jsonb not null,
  composite   double precision not null,
  computed_at timestamptz not null default now(),
  primary key (fight_id, version)
);

------------------------------------------------------------------------------
-- User ratings (own rows only)
------------------------------------------------------------------------------

create table public.ratings (
  id          uuid primary key default gen_random_uuid(),
  fight_id    uuid not null references public.fights (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  stars       smallint not null check (stars between 1 and 5),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ratings_one_per_user_and_fight unique (user_id, fight_id)
);
create index ratings_fight_idx on public.ratings (fight_id);
create trigger ratings_set_updated_at before update on public.ratings
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------------
-- Row Level Security and privileges
------------------------------------------------------------------------------

-- Public tables: read-only for anon and authenticated.
alter table public.events            enable row level security;
alter table public.fighters          enable row level security;
alter table public.fights            enable row level security;
alter table public.scoring_versions  enable row level security;
alter table public.excitement_scores enable row level security;

revoke all on public.events, public.fighters, public.fights,
              public.scoring_versions, public.excitement_scores
  from anon, authenticated;
grant select on public.events, public.fighters, public.fights,
                public.scoring_versions, public.excitement_scores
  to anon, authenticated;

create policy events_public_read            on public.events            for select to anon, authenticated using (true);
create policy fighters_public_read          on public.fighters          for select to anon, authenticated using (true);
create policy fights_public_read            on public.fights            for select to anon, authenticated using (true);
create policy scoring_versions_public_read  on public.scoring_versions  for select to anon, authenticated using (true);
create policy excitement_scores_public_read on public.excitement_scores for select to anon, authenticated using (true);

-- Private tables: RLS on, deliberately NO policies, and privileges revoked as a second lock.
alter table public.fight_results       enable row level security;
alter table public.fight_rounds        enable row level security;
alter table public.excitement_features enable row level security;

revoke all on public.fight_results, public.fight_rounds, public.excitement_features
  from anon, authenticated;

-- Ratings: authenticated users manage only their own rows. No public aggregate yet.
alter table public.ratings enable row level security;
revoke all on public.ratings from anon, authenticated;
grant select, insert, update, delete on public.ratings to authenticated;

create policy ratings_select_own on public.ratings
  for select to authenticated using (user_id = (select auth.uid()));
create policy ratings_insert_own on public.ratings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy ratings_update_own on public.ratings
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy ratings_delete_own on public.ratings
  for delete to authenticated using (user_id = (select auth.uid()));

------------------------------------------------------------------------------
-- Reveal path: exactly one fight per call, no bulk variant.
------------------------------------------------------------------------------

create or replace function public.reveal_fight(p_fight_id uuid)
returns table (
  fight_id          uuid,
  outcome           text,
  winner_fighter_id uuid,
  method            text,
  method_detail     text,
  end_round         smallint,
  end_time_seconds  integer,
  scorecards        jsonb,
  bonuses           text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.fight_id, r.outcome, r.winner_fighter_id, r.method, r.method_detail,
         r.end_round, r.end_time_seconds, r.scorecards, r.bonuses
  from public.fight_results r
  where r.fight_id = p_fight_id;
$$;

revoke all on function public.reveal_fight(uuid) from public, anon, authenticated;
grant execute on function public.reveal_fight(uuid) to anon, authenticated;
