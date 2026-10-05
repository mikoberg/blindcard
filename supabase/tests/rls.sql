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
