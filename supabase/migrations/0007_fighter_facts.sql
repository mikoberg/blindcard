-- 0007: a fighter's country and the records going into a bout (both pre-fight facts).
--
-- fighters.country: lower-case ISO 3166-1 alpha-2 code (or gb-eng / gb-sct / gb-wls / gb-nir),
-- shown as a flag. NULL = not known.
-- fights.records: each fighter's professional MMA record BEFORE the bout, from their Wikipedia
-- page ("the record of the row before"), never the record after it:
--   {"a": {"w": 18, "l": 4, "d": 0, "nc": 0}, "b": {...}}      (a side is absent when unknown)

alter table public.fighters
  add column country text check (country ~ '^[a-z]{2}(-[a-z]{3})?$');

alter table public.fights add column records jsonb;
