-- Trust & Safety audit tables. Additive only; stores hashed user ids, never plaintext emails.

create table if not exists public.moderation_flags (
  id bigserial primary key,
  user_id_hash text not null,
  route text not null default '',
  category text not null,
  matched text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists moderation_flags_hash_idx
  on public.moderation_flags (user_id_hash, created_at desc);

create table if not exists public.image_generation_logs (
  id bigserial primary key,
  user_id_hash text not null,
  character_id text,
  nsfw_flag boolean not null default false,
  fal_request_id text,
  model text,
  safety_checker boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists image_generation_logs_hash_idx
  on public.image_generation_logs (user_id_hash, created_at desc);
