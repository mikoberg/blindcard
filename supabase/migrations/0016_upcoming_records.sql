-- 0016: the record each fighter brings into an upcoming bout.
--
-- Same shape and meaning as `fights.records`: the professional record BEFORE the bout ({w, l, d, nc}),
-- which for an upcoming bout is the record as it stands today. It is computed in the ingest from
-- the record going into the fighter's latest completed fight plus that fight's result, and left
-- null when either is not known (never guessed; a debut or an unmatched fighter has none).
--
-- Known and accepted: the same is already true between two consecutive completed fights, whose
-- going-in records differ by the result of the first. Recent results are not held back.
--
-- Apply this migration BEFORE deploying the web app that reads it.

alter table public.upcoming_bouts
  add column fighter_a_record jsonb,
  add column fighter_b_record jsonb,
  add constraint upcoming_bouts_records_shape check (
    (fighter_a_record is null or (fighter_a_record ?& array['w', 'l', 'd', 'nc']))
    and (fighter_b_record is null or (fighter_b_record ?& array['w', 'l', 'd', 'nc']))
  );
