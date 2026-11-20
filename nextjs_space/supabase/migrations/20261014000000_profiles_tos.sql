-- Terms of Service acceptance on the cloud profile.
-- Safe to re-run: the table and columns are created only when missing.

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

alter table nexus."User"
  add column if not exists "termsAccepted" boolean not null default false;

alter table nexus."User"
  add column if not exists "termsAcceptedAt" timestamp(3);

update public.profiles
set terms_accepted = true,
    terms_accepted_at = coalesce(terms_accepted_at, tos_accepted_at)
where accepted_tos = true
  and terms_accepted = false;

update nexus."User"
set "termsAccepted" = true
where "termsAcceptedAt" is not null
  and "termsAccepted" = false;

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
