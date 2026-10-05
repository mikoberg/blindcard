-- 0018: the fighting style of every fighter (display only).
--
-- Labels from a fixed list (Kickboxing, Muay Thai, Wrestling, Brazilian jiu-jitsu, ...), at most
-- three, read from the fighter's Wikipedia infobox (style and belts) and, where that has nothing,
-- from the "Fighting style" of their official athlete page. Empty = not known: many sources say
-- nothing, or only "MMA". A pre-fight fact about the fighter, shown on every card they are on. It is
-- not used by any prediction.
--
-- `style_ufc_checked_at`: when the official athlete page was last looked at for this fighter, so a
-- fighter without a style there is not asked again for months (that site is read slowly, at its own
-- crawl delay).
--
-- Apply this migration BEFORE deploying the web app that reads it.

alter table public.fighters
  add column style text[] not null default '{}',
  add column style_ufc_checked_at timestamptz,
  add constraint fighters_style_size check (cardinality(style) <= 3);
