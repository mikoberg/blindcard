-- 0010: public judge statistics: how often each judge scores against the final result and how wide
-- they score. Aggregates only (counts and sums per judge, plus the totals of all judges): no fight,
-- event, fighter or score of a single bout. The scorecards themselves stay in `fight_results`.
-- Written by the ingest connection only (`ingest-judges`), read by anyone.
--
-- Known and accepted: a judge's card count grows after an event, so someone who knows which judges
-- sat at a card could tell that a bout went the distance. Recent events are not held back.
--
-- Apply this migration BEFORE deploying the web app that reads it.

create table public.judge_stats (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  -- every spelling of the name (e.g. reversed order) that links to this judge
  slugs text[] not null,
  cards integer not null check (cards >= 0),
  dissent integer not null check (dissent >= 0),
  lone_dissent integer not null check (lone_dissent >= 0),
  abs_sum integer not null check (abs_sum >= 0),
  abs_sumsq integer not null check (abs_sumsq >= 0),
  first_year integer not null,
  last_year integer not null
);

create index judge_stats_slugs_idx on public.judge_stats using gin (slugs);

create table public.judge_baseline (
  id integer primary key check (id = 1),
  cards integer not null,
  dissent integer not null,
  abs_sum integer not null,
  abs_sumsq integer not null,
  judges_with_enough integer not null,
  updated_at timestamptz not null default now()
);

alter table public.judge_stats enable row level security;
alter table public.judge_baseline enable row level security;

create policy judge_stats_public_read on public.judge_stats
  for select to anon, authenticated using (true);
create policy judge_baseline_public_read on public.judge_baseline
  for select to anon, authenticated using (true);

revoke all on public.judge_stats, public.judge_baseline from public, anon, authenticated;
grant select on public.judge_stats, public.judge_baseline to anon, authenticated;
