-- 0013: the expected rating of an upcoming bout ("how worth watching").
--
-- A prediction is a pre-fight fact about a bout that has not been fought: it is learned from the
-- PUBLIC star ratings of the fighters' earlier fights and from the public context of the card
-- (main event, title, division). It never uses a result or a private feature (finish, pace), so it
-- cannot move because of how a fight ended, and it says nothing about who wins.
--
-- It lives on the upcoming bout only. The upcoming rows are deleted the day after the event, so a
-- prediction is never shown next to the real rating of the same fight. Written by the ingest
-- connection (`predict-upcoming`), read by anyone.
--
-- Apply this migration BEFORE deploying the web app that reads it.

alter table public.upcoming_bouts
  add column predicted_stars numeric(3, 2) check (predicted_stars between 1 and 5),
  -- how many of the two fighters have earlier rated fights to go on: both / one / none
  add column prediction_basis text check (prediction_basis in ('both', 'one', 'none')),
  -- [{ "label": "Spot on the card", "amount": 0.31 }, ...] largest first, in stars
  add column prediction_why jsonb,
  add column prediction_version integer;

alter table public.upcoming_bouts
  add constraint upcoming_bouts_prediction_complete check (
    (predicted_stars is null and prediction_basis is null and prediction_version is null)
    or (predicted_stars is not null and prediction_basis is not null and prediction_version is not null)
  );
