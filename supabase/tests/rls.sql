-- RLS / spoiler-isolation tests for 0001_init.sql.
--
-- Needs a Supabase database (roles anon/authenticated, auth.users, auth.uid()).
-- Run against a THROWAWAY dev database, never production:
--   psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
-- Everything runs inside one transaction that is rolled back at the end.
-- Any failed assertion raises an exception and aborts the script.

begin;

------------------------------------------------------------------------------
-- Seed (as the connecting owner role, which bypasses RLS)
------------------------------------------------------------------------------

insert into public.events (id, source, source_id, name, slug, event_date)
values ('00000000-0000-0000-0000-0000000000e1', 'test', 'ev1', 'Test Event', 'test-event', '2026-01-01');

insert into public.fighters (id, source, source_id, name, slug) values
  ('00000000-0000-0000-0000-0000000000a1', 'test', 'aaa111', 'Fighter A', 'fighter-a'),
  ('00000000-0000-0000-0000-0000000000b1', 'test', 'bbb222', 'Fighter B', 'fighter-b');

insert into public.fights (id, event_id, source, source_id, card_position, fighter_a_id, fighter_b_id)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1',
        'test', 'fight1', 1,
        '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1');

insert into public.fight_results (fight_id, outcome, winner_fighter_id, method, end_round, end_time_seconds)
values ('00000000-0000-0000-0000-0000000000f1', 'win',
        '00000000-0000-0000-0000-0000000000b1', 'KO/TKO', 2, 123);

insert into public.fight_rounds (fight_id, round_number, fighter_id, knockdowns)
values ('00000000-0000-0000-0000-0000000000f1', 1, '00000000-0000-0000-0000-0000000000a1', 0),
       ('00000000-0000-0000-0000-0000000000f1', 1, '00000000-0000-0000-0000-0000000000b1', 1);

-- A populated database already has an active version: deactivate it inside this transaction
-- (rolled back at the end) and seed our own, so the script runs on empty and filled databases.
update public.scoring_versions set is_active = false;
insert into public.scoring_versions (version, config, reference, is_active)
values (9001, '{"version": 9001}'::jsonb, '{}'::jsonb, true);
insert into public.excitement_scores (fight_id, version, percentile, stars)
values ('00000000-0000-0000-0000-0000000000f1', 9001, 91.50, 4.5);
insert into public.excitement_features (fight_id, version, features, composite)
values ('00000000-0000-0000-0000-0000000000f1', 9001, '{"finish": 1}'::jsonb, 1.23);

-- A later, not yet active version with features of its own: reveal_score must ignore it.
insert into public.scoring_versions (version, config, reference, is_active)
values (9002, '{"version": 9002}'::jsonb, '{}'::jsonb, false);
insert into public.excitement_features (fight_id, version, features, composite)
values ('00000000-0000-0000-0000-0000000000f1', 9002, '{"finish": 0}'::jsonb, 0.5);
insert into public.excitement_scores (fight_id, version, percentile, stars)
values ('00000000-0000-0000-0000-0000000000f1', 9002, 12.00, 1.5);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000c2');
insert into public.ratings (fight_id, user_id, stars)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c2', 2);

-- Country: an ISO-style code only (as owner).
do $$
begin
  begin
    update public.fighters set country = 'Brazil' where source = 'test';
    raise exception 'FAIL: fighters accepted a country that is not a code';
  exception when check_violation then
    raise notice 'PASS countries must be codes';
  end;
end $$;

-- Card segment: only the three known values (as owner).
do $$
begin
  begin
    update public.fights set card_segment = 'headliner' where source = 'test';
    raise exception 'FAIL: fights accepted an unknown card segment';
  exception when check_violation then
    raise notice 'PASS unknown card segments are rejected';
  end;
end $$;

------------------------------------------------------------------------------
-- Fighter-order guard (as owner): a/b must follow the source_id rule, never the listing
------------------------------------------------------------------------------

do $$
begin
  begin
    insert into public.fights (event_id, source, source_id, card_position, fighter_a_id, fighter_b_id)
    values ('00000000-0000-0000-0000-0000000000e1', 'test', 'fight2', 2,
            '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1');
    raise exception 'FAIL: fights accepted fighter_a with the larger source_id';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  raise notice 'PASS fighter order guard rejects reversed order';
end $$;

insert into public.fight_videos (fight_id, youtube_id, channel)
values ('00000000-0000-0000-0000-0000000000f1', 'dQw4w9WgXcQ', 'Test channel');

insert into public.judge_stats (slug, name, slugs, cards, dissent, lone_dissent, abs_sum, abs_sumsq, first_year, last_year)
values ('test-judge', 'Test Judge', '{test-judge}', 40, 3, 1, 80, 170, 2015, 2025);
insert into public.judge_baseline (id, cards, dissent, abs_sum, abs_sumsq, judges_with_enough)
values (1, 100, 7, 205, 450, 2)
on conflict (id) do nothing;
insert into public.upcoming_events (id, wiki_title, name, slug, event_date)
values ('00000000-0000-0000-0000-0000000000d1', 'Test upcoming', 'Test Upcoming Event', 'test-upcoming', '2999-01-01');
insert into public.upcoming_bouts (id, event_id, card_position, fighter_a_name, fighter_b_name, has_pick)
values ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', 1, 'Test A', 'Test B', true);
insert into public.upcoming_picks (bout_id, favoured, probability, basis, accuracy, version)
values ('00000000-0000-0000-0000-0000000000d2', 'a', 0.6, 'both', 0.57, 1);
insert into public.judge_disputes (judge_slug, fight_id, judge_card, margin, lone, severity)
values ('test-judge', '00000000-0000-0000-0000-0000000000f1', 'Test Judge 29 - 28', -1, true, 3);

------------------------------------------------------------------------------
-- anon
------------------------------------------------------------------------------

set local role anon;

do $$
declare
  tbl text;
  n   integer;
begin
  -- Private tables: not readable at all.
  foreach tbl in array array['fight_results', 'fight_rounds', 'excitement_features', 'ratings'] loop
    begin
      execute format('select count(*) from public.%I', tbl) into n;
      raise exception 'FAIL: anon could read public.% (% rows visible)', tbl, n;
    exception when insufficient_privilege then
      raise notice 'PASS anon cannot read %', tbl;
    end;
  end loop;

  -- Public tables: readable (counts scoped to the seeded rows: a filled database has more).
  select count(*) into n from public.fights where source = 'test';
  if n <> 1 then raise exception 'FAIL: anon should see 1 fight, saw %', n; end if;
  select count(*) into n from public.events where source = 'test';
  if n <> 1 then raise exception 'FAIL: anon should see 1 event, saw %', n; end if;
  select count(*) into n from public.excitement_scores where version = 9001;
  if n <> 1 then raise exception 'FAIL: anon should see 1 score, saw %', n; end if;
  -- A version that is not active yet stays invisible (two versions side by side can leak).
  select count(*) into n from public.excitement_scores where version = 9002;
  if n <> 0 then raise exception 'FAIL: anon can read scores of an inactive version'; end if;
  raise notice 'PASS anon can read public card data';

  -- Public tables: not writable.
  begin
    insert into public.events (source, source_id, name, slug, event_date)
    values ('x', 'x', 'x', 'x', '2026-01-02');
    raise exception 'FAIL: anon could insert into events';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot write events';
  end;

  -- The fights table must carry no result columns at all.
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'fights'
    and column_name in ('winner_fighter_id', 'winner', 'method', 'end_round', 'end_time_seconds', 'bonuses');
  if n <> 0 then raise exception 'FAIL: fights has result columns'; end if;
  raise notice 'PASS fights has no result columns';
end $$;

-- Reveal path: exactly one fight per call.
do $$
declare
  n integer;
begin
  select count(*) into n from public.reveal_fight('00000000-0000-0000-0000-0000000000f1');
  if n <> 1 then raise exception 'FAIL: reveal_fight should return exactly 1 row, got %', n; end if;
  select count(*) into n from public.reveal_fight('00000000-0000-0000-0000-00000000dead');
  if n <> 0 then raise exception 'FAIL: reveal_fight leaked a row for an unknown fight'; end if;
  raise notice 'PASS reveal_fight returns one fight at a time';
end $$;

-- Homepage overview: public, active version only, no result columns.
do $$
declare
  n integer;
  r jsonb;
begin
  select count(*) into n from public.event_overview where id = '00000000-0000-0000-0000-0000000000e1';
  if n <> 1 then raise exception 'FAIL: anon should see the seeded event in event_overview, saw %', n; end if;
  select ratings into r from public.event_overview where id = '00000000-0000-0000-0000-0000000000e1';
  -- one fight, rated by the active version 9001 (4.5), not by the inactive 9002 (1.5)
  if r <> '[{"p": 1, "s": 4.5}]'::jsonb then
    raise exception 'FAIL: event_overview ratings should hold the active version only, got %', r;
  end if;
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'event_overview'
    and column_name not in ('id', 'slug', 'name', 'event_date', 'location', 'ratings',
                            'main_event_a', 'main_event_b', 'main_event_title');
  if n <> 0 then raise exception 'FAIL: event_overview has unexpected columns'; end if;
  -- The headliners are the card-position-1 fighters (the seed's Fighter A / Fighter B).
  if (select main_event_a || '|' || main_event_b from public.event_overview
       where id = '00000000-0000-0000-0000-0000000000e1') <> 'Fighter A|Fighter B' then
    raise exception 'FAIL: event_overview should name the main event fighters';
  end if;
  raise notice 'PASS event_overview is public, active version only';
end $$;

-- Fighter leaderboard: public, active version only, aggregates only.
do $$
declare
  n integer;
  r record;
begin
  select count(*) into n from public.fighter_ratings;
  if n <> 2 then raise exception 'FAIL: anon should see the two seeded fighters in fighter_ratings, saw %', n; end if;
  select * into r from public.fighter_ratings where name = 'Fighter A';
  -- one fight, rated by the active version 9001 (4.5), not by the inactive 9002 (1.5)
  if r.rated_fights <> 1 or r.avg_stars <> 4.5 then
    raise exception 'FAIL: fighter_ratings should hold the active version only, got % / %', r.rated_fights, r.avg_stars;
  end if;
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'fighter_ratings'
    and column_name not in ('id', 'name', 'country', 'rated_fights', 'avg_stars', 'slug');
  if n <> 0 then raise exception 'FAIL: fighter_ratings has unexpected columns'; end if;
  raise notice 'PASS fighter_ratings is public, active version only';
end $$;

-- The rated fights behind a fighter's average: public, active version only, no result columns.
do $$
declare
  n integer;
  r record;
begin
  select count(*) into n from public.fighter_fights;
  if n <> 2 then raise exception 'FAIL: anon should see one fight per seeded fighter in fighter_fights, saw %', n; end if;
  select * into r from public.fighter_fights where opponent_name = 'Fighter B';
  if r.stars <> 4.5 then raise exception 'FAIL: fighter_fights should hold the active version only, got %', r.stars; end if;
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'fighter_fights'
    and column_name not in ('fighter_slug', 'event_slug', 'event_name', 'event_date', 'opponent_name', 'stars');
  if n <> 0 then raise exception 'FAIL: fighter_fights has unexpected columns'; end if;
  raise notice 'PASS fighter_fights is public, active version only';
end $$;

-- The rated fights (the classics page): public, active version only, no result columns.
do $$
declare
  n integer;
  r record;
begin
  select count(*) into n from public.fight_ratings;
  if n <> 1 then raise exception 'FAIL: anon should see the one seeded rated fight in fight_ratings, saw %', n; end if;
  select * into r from public.fight_ratings;
  if r.stars <> 4.5 then raise exception 'FAIL: fight_ratings should hold the active version only, got %', r.stars; end if;
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'fight_ratings'
    and column_name not in ('fight_id', 'event_slug', 'event_name', 'event_date', 'fighter_a_name',
                            'fighter_b_name', 'weight_class', 'is_title_fight', 'stars');
  if n <> 0 then raise exception 'FAIL: fight_ratings has unexpected columns'; end if;
  raise notice 'PASS fight_ratings is public, active version only';
end $$;

-- Official video ids: public to read, never writable by anon, and nothing but the id and channel.
do $$
declare
  n integer;
begin
  select count(*) into n from public.fight_videos;
  if n <> 1 then raise exception 'FAIL: anon should read the one seeded fight video, saw %', n; end if;
  begin
    insert into public.fight_videos (fight_id, youtube_id, channel)
      select id, 'AAAAAAAAAAA', 'x' from public.fights limit 1;
    raise exception 'FAIL: anon could write a fight video';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'fight_videos'
    and column_name not in ('fight_id', 'youtube_id', 'channel', 'created_at');
  if n <> 0 then raise exception 'FAIL: fight_videos has unexpected columns (a title would spoil)'; end if;
  raise notice 'PASS fight_videos is public read, no title, no writes';
end $$;

-- Judge statistics: public read, never writable, aggregates only (no fight or score columns).
do $$
declare
  n integer;
begin
  select count(*) into n from public.judge_stats where slug = 'test-judge';
  if n <> 1 then raise exception 'FAIL: anon should read the seeded judge, saw %', n; end if;
  select count(*) into n from public.judge_baseline;
  if n < 1 then raise exception 'FAIL: anon should read the judge baseline'; end if;
  begin
    insert into public.judge_stats (slug, name, slugs, cards, dissent, lone_dissent, abs_sum, abs_sumsq, first_year, last_year)
      values ('x', 'x', '{x}', 1, 0, 0, 1, 1, 2020, 2020);
    raise exception 'FAIL: anon could write judge stats';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name in ('judge_stats', 'judge_baseline')
    and column_name ~ '(fight|event|fighter|winner|method|score)';
  if n <> 0 then raise exception 'FAIL: judge tables have a per-bout column'; end if;
  raise notice 'PASS judge statistics are public aggregates';
end $$;

-- Disputed scorecards name a fight, so they are private: no direct read, only the function
-- (one judge, at most 10 rows, and only for judges that have a page).
do $$
declare
  n integer;
begin
  begin
    perform count(*) from public.judge_disputes;
    raise exception 'FAIL: anon could read judge_disputes';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot read judge_disputes';
  end;
  begin
    insert into public.judge_disputes (judge_slug, fight_id, judge_card, margin, lone, severity)
      values ('x', '00000000-0000-0000-0000-0000000000f1', 'x', -1, true, 1);
    raise exception 'FAIL: anon could write judge_disputes';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.judge_disputed_cards('test-judge');
  if n <> 1 then raise exception 'FAIL: judge_disputed_cards should return the seeded card, got %', n; end if;
  select count(*) into n from public.judge_disputed_cards('test-judge', 1000);
  if n > 10 then raise exception 'FAIL: judge_disputed_cards returned more than 10 rows'; end if;
  select count(*) into n from public.judge_disputed_cards('nobody');
  if n <> 0 then raise exception 'FAIL: judge_disputed_cards leaked rows for an unknown judge'; end if;
  raise notice 'PASS judge_disputed_cards is the only way to read disputed scorecards';
end $$;

-- Upcoming events are public pre-fight facts: readable, never writable, no result columns.
do $$
declare
  n integer;
begin
  select count(*) into n from public.upcoming_events where slug = 'test-upcoming';
  if n <> 1 then raise exception 'FAIL: anon should read the seeded upcoming event, saw %', n; end if;
  select count(*) into n from public.upcoming_bouts where fighter_a_name = 'Test A';
  if n <> 1 then raise exception 'FAIL: anon should read the seeded upcoming bout, saw %', n; end if;
  begin
    insert into public.upcoming_events (wiki_title, name, slug, event_date)
      values ('x', 'x', 'x', '2999-01-02');
    raise exception 'FAIL: anon could write an upcoming event';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.upcoming_bouts set weight_class = 'x';
    raise exception 'FAIL: anon could change an upcoming bout';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name in ('upcoming_events', 'upcoming_bouts')
    and column_name ~ '(winner|method|round|result|score|streak|time)'
    -- the going-in records (fighter_a_record) are pre-fight facts and allowed; start times are too
    and column_name !~ '(_at$|_record$)';
  if n <> 0 then raise exception 'FAIL: upcoming tables have a result-like column'; end if;
  raise notice 'PASS upcoming events are public pre-fight facts';
end $$;

-- Who is favoured is learned from results, so it is private: no direct read, one bout per call.
do $$
declare
  n integer;
begin
  begin
    perform count(*) from public.upcoming_picks;
    raise exception 'FAIL: anon could read upcoming_picks';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot read upcoming_picks';
  end;
  begin
    insert into public.upcoming_picks (bout_id, favoured, probability, basis, accuracy, version)
      values ('00000000-0000-0000-0000-0000000000d2', 'b', 0.6, 'one', 0.5, 1);
    raise exception 'FAIL: anon could write upcoming_picks';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.upcoming_pick('00000000-0000-0000-0000-0000000000d2');
  if n <> 1 then raise exception 'FAIL: upcoming_pick should return exactly 1 row, got %', n; end if;
  select count(*) into n from public.upcoming_pick('00000000-0000-0000-0000-00000000dead');
  if n <> 0 then raise exception 'FAIL: upcoming_pick leaked a row for an unknown bout'; end if;
  select count(*) into n from public.upcoming_bouts where has_pick;
  if n < 1 then raise exception 'FAIL: has_pick should be public'; end if;
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'upcoming_bouts'
    and column_name ~ '(favour|probab|pick_|winner)';
  if n <> 0 then raise exception 'FAIL: upcoming_bouts names who is favoured'; end if;
  raise notice 'PASS upcoming_pick is the only way to read a pick';
end $$;

-- Card segments are a public, pre-fight fact: readable, but only the three known values.
do $$
declare
  n integer;
begin
  select count(*) into n from public.fights where source = 'test' and card_segment is null;
  if n <> 1 then raise exception 'FAIL: seeded fight should have no segment yet, got %', n; end if;
  begin
    update public.fights set card_segment = 'main' where source = 'test';
    raise exception 'FAIL: anon could write a card segment';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot write card segments';
  end;
end $$;

-- Career context is a public pre-fight fact: readable, not writable.
do $$
declare
  n integer;
begin
  select count(*) into n from public.fights where source = 'test' and career is null;
  if n <> 1 then raise exception 'FAIL: seeded fight should have no career context yet'; end if;
  begin
    update public.fights set career = '{}'::jsonb where source = 'test';
    raise exception 'FAIL: anon could write career context';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot write career context';
  end;
end $$;

-- Fighter country and the records going into a bout are public pre-fight facts.
do $$
begin
  begin
    update public.fighters set country = 'br' where source = 'test';
    raise exception 'FAIL: anon could write a fighter country';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot write fighter countries';
  end;
  begin
    update public.fights set records = '{}'::jsonb where source = 'test';
    raise exception 'FAIL: anon could write fight records';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot write fight records';
  end;
end $$;

-- Score breakdown reveal: one fight per call, active version only, same config as the features.
do $$
declare
  n integer;
  v integer;
  cfg jsonb;
begin
  select count(*) into n from public.reveal_score('00000000-0000-0000-0000-0000000000f1');
  select r.version, r.config into v, cfg
  from public.reveal_score('00000000-0000-0000-0000-0000000000f1') r;
  if n <> 1 or v <> 9001 or cfg->>'version' <> '9001' then
    raise exception 'FAIL: reveal_score should return the active version''s row, got % rows', n;
  end if;
  select count(*) into n from public.reveal_score('00000000-0000-0000-0000-00000000dead');
  if n <> 0 then raise exception 'FAIL: reveal_score leaked a row for an unknown fight'; end if;
  raise notice 'PASS reveal_score returns one fight at a time';
end $$;

reset role;

------------------------------------------------------------------------------
-- authenticated (user c1)
------------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
set local role authenticated;

do $$
declare
  tbl text;
  n   integer;
begin
  foreach tbl in array array['fight_results', 'fight_rounds', 'excitement_features'] loop
    begin
      execute format('select count(*) from public.%I', tbl) into n;
      raise exception 'FAIL: authenticated could read public.%', tbl;
    exception when insufficient_privilege then
      raise notice 'PASS authenticated cannot read %', tbl;
    end;
  end loop;

  -- Own rating: allowed. Someone else's rating row is invisible.
  insert into public.ratings (fight_id, user_id, stars)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', 5);
  select count(*) into n from public.ratings;
  if n <> 1 then raise exception 'FAIL: user should see only their own rating, saw %', n; end if;
  raise notice 'PASS ratings are own-rows only (read)';

  -- Rating on behalf of another user: rejected by RLS.
  begin
    insert into public.ratings (fight_id, user_id, stars)
    values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c2', 1);
    raise exception 'FAIL: user could insert a rating for another user';
  exception when insufficient_privilege then
    raise notice 'PASS ratings are own-rows only (write)';
  end;
end $$;

reset role;

rollback;

\echo 'rls.sql: all assertions passed'
