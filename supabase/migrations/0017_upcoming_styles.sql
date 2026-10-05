-- 0017: the fighting style of each fighter on an upcoming bout (display only).
--
-- Read from the infobox `style` field of the fighter's Wikipedia page, reduced to a fixed list of
-- labels (Kickboxing, Muay Thai, Wrestling, Brazilian jiu-jitsu, ...), at most three per fighter,
-- in the page's order. Empty = not known: many pages do not say. A pre-fight fact about the
-- fighter, not about the bout. It is not used to predict anything (tested: it did not help).
--
-- Apply this migration BEFORE deploying the web app that reads it.

alter table public.upcoming_bouts
  add column fighter_a_style text[] not null default '{}',
  add column fighter_b_style text[] not null default '{}',
  add constraint upcoming_bouts_style_size check (
    cardinality(fighter_a_style) <= 3 and cardinality(fighter_b_style) <= 3
  );
