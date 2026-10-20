-- World Info / lorebooks.
-- Chat reads nexus."Lorebook" and nexus."LoreEntry" (Prisma).
-- public.lorebooks and public.lorebook_entries are the cloud copy used by batch import.

alter table nexus."LoreEntry"
  add column if not exists placement text not null default 'default';

alter table nexus."LoreEntry"
  add column if not exists constant boolean not null default false;

create table if not exists public.lorebooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default '',
  description text not null default '',
  local_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lorebook_entries (
  id uuid primary key default gen_random_uuid(),
  lorebook_id uuid not null references public.lorebooks (id) on delete cascade,
  title text not null default '',
  keywords text[] not null default '{}',
  content text not null default '',
  insertion_order integer not null default 100,
  priority integer not null default 50,
  scan_depth integer not null default 4,
  placement text not null default 'default',
  enabled boolean not null default true,
  constant boolean not null default false,
  local_id text
);

create index if not exists lorebooks_user_idx on public.lorebooks (user_id);
create index if not exists lorebook_entries_book_idx on public.lorebook_entries (lorebook_id);
create unique index if not exists lorebook_entries_local_idx on public.lorebook_entries (local_id) where local_id is not null;

alter table public.lorebooks enable row level security;
alter table public.lorebook_entries enable row level security;

revoke all on table public.lorebooks from anon;
revoke all on table public.lorebook_entries from anon;
