-- Reroll counters + per-user generation cooldowns. Additive only.

create table if not exists public.scene_generation_state (
  message_id text primary key,
  user_id text not null,
  generation_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.text_swipe_state (
  turn_id text primary key,
  session_id text not null,
  user_id text not null,
  swipe_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.generation_cooldowns (
  user_id text not null,
  kind text not null,
  last_at timestamptz not null default now(),
  in_flight boolean not null default false,
  primary key (user_id, kind)
);
