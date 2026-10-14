-- Card comments and profile guestbook comments.
-- Site cards live in nexus."Character" (text ids) and public.characters.local_id.
-- There is no public.cards table, and public.profiles is the terms row for auth.users,
-- so these comments are keyed by the site card id and the site account id.

create extension if not exists pgcrypto;

create table if not exists public.card_comments (
  id uuid primary key default gen_random_uuid(),
  card_id text not null,
  user_id text not null,
  author_name text not null default '',
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists card_comments_card_idx on public.card_comments (card_id, created_at desc);

create table if not exists public.profile_comments (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null,
  author_id text not null,
  author_name text not null default '',
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists profile_comments_profile_idx on public.profile_comments (profile_id, created_at desc);

alter table public.card_comments enable row level security;
alter table public.profile_comments enable row level security;

drop policy if exists "Allow public read access for card_comments" on public.card_comments;
create policy "Allow public read access for card_comments"
  on public.card_comments for select
  using (true);

drop policy if exists "Allow public read access for profile_comments" on public.profile_comments;
create policy "Allow public read access for profile_comments"
  on public.profile_comments for select
  using (true);

grant select on public.card_comments to anon, authenticated;
grant select on public.profile_comments to anon, authenticated;
