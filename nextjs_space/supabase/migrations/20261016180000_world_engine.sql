-- Persistent world state and long-term memories for a chat session.
-- ChatSession.id values are cuid strings, so session_id is text.
-- Embeddings are 1536-d so they match text-embedding-3-small and Gemini outputDimensionality.

create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;

create table if not exists public.world_states (
  session_id text primary key,
  stats jsonb not null default '{"trust":0,"inventory":[],"house":"","alignment":""}'::jsonb,
  unlocked_achievements text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  content text not null,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now()
);

create index if not exists memories_session_idx on public.memories (session_id);

create index if not exists memories_embedding_hnsw
  on public.memories
  using hnsw (embedding extensions.vector_cosine_ops);

revoke all on table public.world_states from anon, authenticated;
revoke all on table public.memories from anon, authenticated;
