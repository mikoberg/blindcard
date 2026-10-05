-- 0020: search that ignores accents, case and apostrophes.
--
-- "O'Malley", "O’Malley" (the curly apostrophe phones type) and "omalley" are the same search, and
-- "Prochazka" finds "Procházka". `fold_name` is the one folding rule; the web app applies the same
-- rule to what a visitor types (web/lib/leaderboard/search.ts, kept in step by a test), and the view
-- carries the folded name so the search is one ILIKE on one column.
--
-- Plain SQL on purpose (no extension): lower-case folding does not depend on the database locale,
-- because the upper-case letters are in the translate table as well.

create or replace function public.fold_name(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(
      lower(translate(
        replace(replace(replace(p_text, 'ß', 'ss'), 'æ', 'ae'), 'œ', 'oe'),
        'àáâãäåāăąçćčďđðèéêëēėęěğìíîïīįıłñńňòóôõöøōőŕřśšşťùúûüūůűųýÿźżžÀÁÂÃÄÅĀĂĄÇĆČĎĐÐÈÉÊËĒĖĘĚĞÌÍÎÏĪĮIŁÑŃŇÒÓÔÕÖØŌŐŔŘŚŠŞŤÙÚÛÜŪŮŰŲÝŸŹŻŽ',
        'aaaaaaaaacccdddeeeeeeeegiiiiiiilnnnoooooooorrssstuuuuuuuuyyzzzaaaaaaaaacccdddeeeeeeeegiiiiiiilnnnoooooooorrssstuuuuuuuuyyzzz'
      )),
      '[''’ʼ‘`´]', '', 'g'),
    '[^a-z0-9\u0080-\uffff]+', ' ', 'g'))
$$;

revoke all on function public.fold_name(text) from public;
grant execute on function public.fold_name(text) to anon, authenticated;

-- Same view as before with one column added at the end: the folded name.
create or replace view public.fighter_ratings
with (security_invoker = true) as
with rated as (
  select f.fighter_a_id as fighter_id, s.stars
  from public.fights f
  join public.excitement_scores s
    on s.fight_id = f.id
   and s.version = (select v.version from public.scoring_versions v where v.is_active)
  union all
  select f.fighter_b_id, s.stars
  from public.fights f
  join public.excitement_scores s
    on s.fight_id = f.id
   and s.version = (select v.version from public.scoring_versions v where v.is_active)
)
select
  fr.id,
  fr.name,
  fr.country,
  count(*)::int as rated_fights,
  round(avg(rated.stars), 2) as avg_stars,
  fr.slug,
  public.fold_name(fr.name) as search_name
from rated
join public.fighters fr on fr.id = rated.fighter_id
group by fr.id;

revoke all on public.fighter_ratings from public, anon, authenticated;
grant select on public.fighter_ratings to anon, authenticated;
