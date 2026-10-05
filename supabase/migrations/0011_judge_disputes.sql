-- 0011: the scorecards a judge scored against the official result, behind an explicit click.
--
-- Naming a fight next to a judge's card shows how that bout was decided, so this is result data
-- like `fight_results`: the table is private (RLS on, no policies, no grants) and the only way out
-- is `judge_disputed_cards`, which the web app calls from a POST route after a click on the judge
-- page ("Show their most disputed scorecards"), after a warning. It is never part of a public
-- page render. At most 10 cards per call, only for judges that have a public page (enough cards),
-- never for the whole table. Written by the ingest connection only (`ingest-judges`).
--
-- Apply this migration BEFORE deploying the web app that reads it.

create table public.judge_disputes (
  judge_slug text not null check (judge_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  fight_id uuid not null references public.fights (id) on delete cascade,
  -- the judge's own card as stored, e.g. "Ron McCarthy 29 - 28"
  judge_card text not null,
  -- second - first score: negative = scored the other fighter ahead of the official result
  margin integer not null check (margin < 0),
  -- both other judges agreed with the official result
  lone boolean not null,
  -- how far the card is from the colleagues' average margin (higher = further away)
  severity double precision not null,
  primary key (judge_slug, fight_id)
);

create index judge_disputes_judge_idx on public.judge_disputes (judge_slug, severity desc);

alter table public.judge_disputes enable row level security;
revoke all on public.judge_disputes from public, anon, authenticated;

create or replace function public.judge_disputed_cards(p_slug text, p_limit integer default 10)
returns table (
  fight_id uuid,
  event_name text,
  event_slug text,
  event_date date,
  fighter_a_name text,
  fighter_a_slug text,
  fighter_b_name text,
  fighter_b_slug text,
  winner_name text,
  method text,
  scorecards jsonb,
  judge_card text,
  margin integer,
  lone boolean,
  severity double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.fight_id, e.name, e.slug, e.event_date,
         fa.name, fa.slug, fb.name, fb.slug,
         w.name, r.method, r.scorecards,
         d.judge_card, d.margin, d.lone, d.severity
  from public.judge_disputes d
  join public.judge_stats j on j.slug = d.judge_slug
  join public.fights f on f.id = d.fight_id
  join public.events e on e.id = f.event_id
  join public.fighters fa on fa.id = f.fighter_a_id
  join public.fighters fb on fb.id = f.fighter_b_id
  join public.fight_results r on r.fight_id = f.id
  left join public.fighters w on w.id = r.winner_fighter_id
  where p_slug = any (j.slugs)
    and j.cards > 0
  order by d.severity desc, e.event_date desc
  limit greatest(1, least(coalesce(p_limit, 10), 10));
$$;

revoke all on function public.judge_disputed_cards(text, integer) from public, anon, authenticated;
grant execute on function public.judge_disputed_cards(text, integer) to anon, authenticated;
