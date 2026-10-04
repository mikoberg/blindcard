-- 0004: which part of the card a fight was on (main card, prelims, early prelims).
--
-- A pre-fight fact (the running order is announced in advance), so it lives on the public
-- fights table. NULL = unknown: events whose segments could not be established completely and
-- unambiguously are left without segments, and the web app then shows a flat card.

alter table public.fights
  add column card_segment text
  check (card_segment in ('main', 'prelim', 'early_prelim'));
