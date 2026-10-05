-- 0015: start times of upcoming events (UTC), from the official event page.
--
-- A pre-fight fact: when the main card, the prelims and the early prelims start. Null = not
-- announced (yet). The web app shows them in the visitor's own time zone (default Amsterdam).
--
-- Apply this migration BEFORE deploying the web app that reads it.

alter table public.upcoming_events
  add column main_card_at timestamptz,
  add column prelims_at timestamptz,
  add column early_prelims_at timestamptz;
