-- 0035: a fighter's date of birth, for the age on their page.
--
-- `fighters.birth_date` comes from the infobox of the fighter's Wikipedia article (or, for fighters
-- without one, their Sherdog page) and is written by `ingest-fighters`, never by the web app. It is a
-- public fact about a public figure; the page shows the age, worked out when it is rendered.
--
-- Apply BEFORE deploying the web app that reads it.

alter table public.fighters add column if not exists birth_date date;
