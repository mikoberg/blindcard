-- 0009: the official full-fight video of a fight (the UFC YouTube channel), for the "Watch" link.
--
-- Only the opaque 11-character YouTube video id and the channel's name. Never the video's title or
-- description: they usually say how the fight ended. We only link to the video on YouTube (a
-- redirect); nothing of it is copied or embedded here. Written by the ingest connection only.
--
-- Apply this migration BEFORE deploying the web app that reads it.

create table public.fight_videos (
  fight_id uuid primary key references public.fights (id) on delete cascade,
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  channel text not null,
  created_at timestamptz not null default now()
);

alter table public.fight_videos enable row level security;

create policy fight_videos_public_read on public.fight_videos
  for select to anon, authenticated using (true);

revoke all on public.fight_videos from public, anon, authenticated;
grant select on public.fight_videos to anon, authenticated;
