-- SubscribeStar.adult billing link fields. Additive only — never drops existing data.

alter table nexus."User"
  add column if not exists "subscribeStarId" text;

alter table nexus."User"
  add column if not exists "subscribeStarUsername" text;

alter table nexus."User"
  add column if not exists "subscribeStarPaidUntil" timestamp(3);

alter table nexus."User"
  add column if not exists "subscribeStarTierId" text;

create unique index if not exists "User_subscribeStarId_key"
  on nexus."User" ("subscribeStarId");

alter table public.profiles
  add column if not exists subscribestar_id text;

alter table public.profiles
  add column if not exists subscribestar_paid_until timestamptz;

alter table public.profiles
  add column if not exists subscribestar_username text;

alter table public.profiles
  add column if not exists subscribestar_tier_id text;

create index if not exists profiles_subscribestar_id_idx
  on public.profiles (subscribestar_id);
