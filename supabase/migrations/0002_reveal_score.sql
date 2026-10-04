-- 0002: reveal path for the score breakdown ("why this rating").
--
-- The features behind a score (finish, timing, pace, ...) are spoilers, so they stay in the
-- private excitement_features table. Like reveal_fight, this function hands out exactly one
-- fight per call, only for the ACTIVE score version, and is called by the web app only after an
-- explicit Reveal click. It returns the version's config snapshot too (public data) so the
-- features and the weights they were scored with always come from the same version.

create or replace function public.reveal_score(p_fight_id uuid)
returns table (
  fight_id   uuid,
  version    integer,
  config     jsonb,
  features   jsonb,
  composite  double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.fight_id, f.version, v.config, f.features, f.composite
  from public.excitement_features f
  join public.scoring_versions v on v.version = f.version and v.is_active
  where f.fight_id = p_fight_id;
$$;

revoke all on function public.reveal_score(uuid) from public, anon, authenticated;
grant execute on function public.reveal_score(uuid) to anon, authenticated;

------------------------------------------------------------------------------
-- Only the ACTIVE version's scores are public.
--
-- Two score versions of the same fight, side by side, can hint at its result (their weights
-- treat finishes differently, and the weights and reference quantiles are public too). A new
-- version is therefore invisible until it is activated, and activating it is the switch.
------------------------------------------------------------------------------

drop policy excitement_scores_public_read on public.excitement_scores;
create policy excitement_scores_public_read on public.excitement_scores
  for select to anon, authenticated
  using (exists (
    select 1 from public.scoring_versions v
    where v.version = excitement_scores.version and v.is_active
  ));
