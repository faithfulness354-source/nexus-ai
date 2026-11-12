-- KidVerse AI — COPPA-oriented schema
-- Zero-PII kid profiles: nickname presets, avatar_id, age_tier, limits, game state only.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Parents (linked to Supabase Auth)
-- ---------------------------------------------------------------------------
create table if not exists public.parents (
  id uuid primary key references auth.users (id) on delete cascade,
  pin_hash text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Kid profiles (no emails, real names, birthdates, locations, or photos)
-- ---------------------------------------------------------------------------
create table if not exists public.kid_profiles (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  nickname text not null,
  avatar_id text not null,
  age_tier text not null check (age_tier in ('ages_5_7', 'ages_8_9', 'ages_10_12')),
  daily_message_limit integer not null default 40 check (daily_message_limit between 5 and 200),
  unlocked_badges jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kid_profiles_parent_id_idx on public.kid_profiles (parent_id);

-- ---------------------------------------------------------------------------
-- Curated starter worlds per Realm
-- ---------------------------------------------------------------------------
create table if not exists public.realm_worlds (
  id uuid primary key default gen_random_uuid(),
  age_tier text not null check (age_tier in ('ages_5_7', 'ages_8_9', 'ages_10_12')),
  title text not null,
  description text not null,
  companion_name text not null,
  theme_config jsonb not null default '{}'::jsonb,
  system_prompt_seed text not null,
  created_at timestamptz not null default now()
);

create index if not exists realm_worlds_age_tier_idx on public.realm_worlds (age_tier);

-- ---------------------------------------------------------------------------
-- Adventure sessions
-- ---------------------------------------------------------------------------
create table if not exists public.adventure_sessions (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kid_profiles (id) on delete cascade,
  world_id uuid not null references public.realm_worlds (id),
  age_tier text not null check (age_tier in ('ages_5_7', 'ages_8_9', 'ages_10_12')),
  state jsonb not null default '{}'::jsonb,
  messages jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'completed', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists adventure_sessions_kid_id_idx on public.adventure_sessions (kid_id);

-- ---------------------------------------------------------------------------
-- Seed: 2 starter worlds per Realm (6 total)
-- ---------------------------------------------------------------------------
insert into public.realm_worlds (id, age_tier, title, description, companion_name, theme_config, system_prompt_seed)
values
  (
    '11111111-1111-1111-1111-111111111101',
    'ages_5_7',
    'Sunny Meadow Trail',
    'Follow Glowbug through soft grass and friendly animal friends.',
    'Glowbug',
    '{"primary":"#2BB673","secondary":"#FFE566","accent":"#FF8A5B","background":"#E8FFF3","icon":"🌻"}'::jsonb,
    'StorySprout meadow adventure. Kindergarten language. 1-2 short sentences. Zero fail states.'
  ),
  (
    '11111111-1111-1111-1111-111111111102',
    'ages_5_7',
    'Cloud Pillow Castle',
    'Float up to a fluffy castle and meet soft cloud pals.',
    'Puff',
    '{"primary":"#7BE0FF","secondary":"#FFE566","accent":"#FF8A5B","background":"#F0FBFF","icon":"☁️"}'::jsonb,
    'StorySprout cloud castle. Voice-friendly picture prompts. Always encouraging.'
  ),
  (
    '11111111-1111-1111-1111-111111111201',
    'ages_8_9',
    'Crystal Cave Codes',
    'Solve glowing riddles to open the crystal doors.',
    'Pip',
    '{"primary":"#2F6FED","secondary":"#7BE0FF","accent":"#FFB020","background":"#EAF3FF","icon":"💎"}'::jsonb,
    'RealmHopper puzzle cave. Offer riddles and backpack collectibles. 2-4 sentences.'
  ),
  (
    '11111111-1111-1111-1111-111111111202',
    'ages_8_9',
    'Skybridge Relay',
    'Race across floating bridges and gather signal tokens.',
    'Zip',
    '{"primary":"#2F6FED","secondary":"#A7F3D0","accent":"#F97316","background":"#EEF6FF","icon":"🌉"}'::jsonb,
    'RealmHopper skybridge quest. Include choices, inventory hooks, and gentle challenges.'
  ),
  (
    '11111111-1111-1111-1111-111111111301',
    'ages_10_12',
    'Emberwood Chronicle',
    'Rebuild a woodland kingdom with gear, stats, and multi-step quests.',
    'Ash',
    '{"primary":"#0F766E","secondary":"#F59E0B","accent":"#DC2626","background":"#F0FDFA","icon":"🌳"}'::jsonb,
    'FableForge RPG. Track quest log, gear, and stats. Middle-grade narration. Strictly G-rated.'
  ),
  (
    '11111111-1111-1111-1111-111111111302',
    'ages_10_12',
    'Starforge Outpost',
    'Design a hero crew and protect a peaceful space village.',
    'Lyra',
    '{"primary":"#0F766E","secondary":"#38BDF8","accent":"#F59E0B","background":"#ECFEFF","icon":"🚀"}'::jsonb,
    'FableForge world-builder outpost. Modular hero choices. Multi-step peaceful quests.'
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.parents enable row level security;
alter table public.kid_profiles enable row level security;
alter table public.realm_worlds enable row level security;
alter table public.adventure_sessions enable row level security;

-- Parents: self only
drop policy if exists parents_select_own on public.parents;
create policy parents_select_own on public.parents
  for select to authenticated
  using (id = auth.uid());

drop policy if exists parents_insert_own on public.parents;
create policy parents_insert_own on public.parents
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists parents_update_own on public.parents;
create policy parents_update_own on public.parents
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Kid profiles: parent-owned only
drop policy if exists kid_profiles_select_own on public.kid_profiles;
create policy kid_profiles_select_own on public.kid_profiles
  for select to authenticated
  using (parent_id = auth.uid());

drop policy if exists kid_profiles_insert_own on public.kid_profiles;
create policy kid_profiles_insert_own on public.kid_profiles
  for insert to authenticated
  with check (parent_id = auth.uid());

drop policy if exists kid_profiles_update_own on public.kid_profiles;
create policy kid_profiles_update_own on public.kid_profiles
  for update to authenticated
  using (parent_id = auth.uid())
  with check (parent_id = auth.uid());

drop policy if exists kid_profiles_delete_own on public.kid_profiles;
create policy kid_profiles_delete_own on public.kid_profiles
  for delete to authenticated
  using (parent_id = auth.uid());

-- Worlds: readable by authenticated parents (curated catalog)
drop policy if exists realm_worlds_select_authenticated on public.realm_worlds;
create policy realm_worlds_select_authenticated on public.realm_worlds
  for select to authenticated
  using (true);

-- Sessions: only for kids belonging to the authenticated parent
drop policy if exists adventure_sessions_select_own on public.adventure_sessions;
create policy adventure_sessions_select_own on public.adventure_sessions
  for select to authenticated
  using (
    exists (
      select 1 from public.kid_profiles kp
      where kp.id = adventure_sessions.kid_id and kp.parent_id = auth.uid()
    )
  );

drop policy if exists adventure_sessions_insert_own on public.adventure_sessions;
create policy adventure_sessions_insert_own on public.adventure_sessions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.kid_profiles kp
      where kp.id = kid_id and kp.parent_id = auth.uid()
    )
  );

drop policy if exists adventure_sessions_update_own on public.adventure_sessions;
create policy adventure_sessions_update_own on public.adventure_sessions
  for update to authenticated
  using (
    exists (
      select 1 from public.kid_profiles kp
      where kp.id = adventure_sessions.kid_id and kp.parent_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.kid_profiles kp
      where kp.id = adventure_sessions.kid_id and kp.parent_id = auth.uid()
    )
  );

drop policy if exists adventure_sessions_delete_own on public.adventure_sessions;
create policy adventure_sessions_delete_own on public.adventure_sessions
  for delete to authenticated
  using (
    exists (
      select 1 from public.kid_profiles kp
      where kp.id = adventure_sessions.kid_id and kp.parent_id = auth.uid()
    )
  );
