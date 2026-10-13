-- NexusAI cloud tables. Run this in the Supabase SQL editor.
-- Local account ids stay in local_id. user_id is the Supabase auth user.

create extension if not exists pgcrypto;

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  local_id text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Unnamed',
  title text not null default '',
  summary text not null default '',
  personality text not null default '',
  scenario text not null default '',
  greeting text not null default '',
  tags text not null default '',
  avatar text,
  banner text,
  nsfw boolean not null default false,
  visibility text not null default 'PRIVATE',
  updated_at timestamptz not null default now()
);

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  local_id text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  character_local_id text,
  title text not null default '',
  body text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  local_id text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  character_local_id text,
  title text not null default 'New Chat',
  model text not null default '',
  provider text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  local_id text not null unique,
  chat_local_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  content text not null default '',
  index integer not null default 0,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists characters_user_idx on public.characters (user_id);
create index if not exists scenarios_user_idx on public.scenarios (user_id);
create index if not exists chats_user_idx on public.chats (user_id);
create table if not exists public.personas (
  id uuid primary key default gen_random_uuid(),
  local_id text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  avatar text,
  pronouns text not null default 'They/Them',
  physical text not null default '',
  attire text not null default '',
  visual_traits text not null default '',
  appearance text not null default '{}',
  avatar_snapshot text not null default '',
  avatar_snapshot_for text not null default '',
  personality text not null default '',
  backstory text not null default '',
  speech text not null default '',
  is_default boolean not null default false,
  bound_character_ids text not null default '[]',
  updated_at timestamptz not null default now()
);

create index if not exists chat_messages_chat_idx on public.chat_messages (chat_local_id, index);
create index if not exists personas_user_idx on public.personas (user_id);

grant select, insert, update, delete on public.characters to authenticated;
grant select, insert, update, delete on public.scenarios to authenticated;
grant select, insert, update, delete on public.chats to authenticated;
grant select, insert, update, delete on public.chat_messages to authenticated;
grant select, insert, update, delete on public.personas to authenticated;

alter table public.characters enable row level security;
alter table public.scenarios enable row level security;
alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;
alter table public.personas enable row level security;

drop policy if exists "own characters" on public.characters;
create policy "own characters" on public.characters
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "public published characters" on public.characters;
create policy "public published characters" on public.characters
  for select to anon, authenticated
  using (visibility = 'PUBLIC');

alter table public.characters add column if not exists banner text;

drop policy if exists "own scenarios" on public.scenarios;
create policy "own scenarios" on public.scenarios
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own chats" on public.chats;
create policy "own chats" on public.chats
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own chat messages" on public.chat_messages;
create policy "own chat messages" on public.chat_messages
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own personas" on public.personas;
create policy "own personas" on public.personas
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Live updates. The browser keeps a realtime socket open and applies each change locally.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['characters', 'scenarios', 'chats', 'chat_messages', 'personas']
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- Terms acceptance. See supabase/migrations/profiles_tos.sql.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  accepted_tos boolean not null default false,
  tos_accepted_at timestamptz
);

alter table public.profiles
  add column if not exists accepted_tos boolean not null default false;

alter table public.profiles
  add column if not exists tos_accepted_at timestamptz;

alter table public.profiles
  add column if not exists terms_accepted boolean not null default false;

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz;

alter table public.profiles enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "Users can update own terms status" on public.profiles;
create policy "Users can update own terms status" on public.profiles
  for update
  using (auth.uid() = id);

grant select, insert, update on public.profiles to authenticated;

