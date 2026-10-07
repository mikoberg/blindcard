-- 0036: the Elo leaderboard can be asked for active fighters, inactive ones or all of them.
--
-- Same private table and same click-free POST route as before (see CLAUDE.md): only the filter is
-- new. "Active" is a fight in the last 730 days (as before); "inactive" is everyone on the board
-- who has not fought since; "all" is both. The limit (at most 100 rows) and the board's own
-- threshold (fighters with at least 8 rated fights) are unchanged, and ranks are those of the list
-- that was asked for. The result type is the same, only the arguments change, so the function is
-- dropped and created again with the same privileges.
--
-- `last_fight` now counts a no contest as a fight: it moves no rating, but the fighter fought, so
-- it keeps them active. Run `compute-elo` again to refresh the stored dates.
--
-- Apply BEFORE deploying the web app that reads it.

drop function if exists public.elo_leaderboard(integer);

create function public.elo_leaderboard(p_limit integer default 50, p_status text default 'active')
returns table (
  rank integer,
  name text,
  slug text,
  country text,
  rating numeric,
  fights integer,
  last_fight date,
  peak numeric,
  peak_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  select (row_number() over (order by e.rating desc, f.id))::integer as rank,
         f.name, f.slug, f.country, e.rating, e.fights, e.last_fight,
         greatest(coalesce(e.peak, e.rating), e.rating) as peak,
         case when e.peak is null or e.peak <= e.rating then e.last_fight else e.peak_date end as peak_date
  from public.fighter_elo e
  join public.fighters f on f.id = e.fighter_id
  where case coalesce(p_status, 'active')
          when 'active' then e.last_fight >= current_date - 730
          when 'inactive' then e.last_fight < current_date - 730
          when 'all' then true
          else false
        end
  order by e.rating desc, f.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.elo_leaderboard(integer, text) from public, anon, authenticated;
grant execute on function public.elo_leaderboard(integer, text) to anon, authenticated;
