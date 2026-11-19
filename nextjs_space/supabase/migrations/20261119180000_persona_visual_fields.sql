-- VLM-cached persona / character visual fields for token-optimized chat injection.

alter table if exists public.personas
  add column if not exists visual_description text,
  add column if not exists visual_anchor text,
  add column if not exists visual_analyzed_for text not null default '';

alter table if exists public.characters
  add column if not exists visual_description text,
  add column if not exists visual_anchor text,
  add column if not exists visual_analyzed_for text not null default '';

-- Prisma-mirrored tables (quoted identifiers) when present.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'Persona'
  ) then
    execute 'alter table public."Persona" add column if not exists "visualDescription" text';
    execute 'alter table public."Persona" add column if not exists "visualAnchor" text';
    execute 'alter table public."Persona" add column if not exists "visualAnalyzedFor" text not null default ''''';
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'Character'
  ) then
    execute 'alter table public."Character" add column if not exists "visualDescription" text';
    execute 'alter table public."Character" add column if not exists "visualAnchor" text';
    execute 'alter table public."Character" add column if not exists "visualAnalyzedFor" text not null default ''''';
  end if;
end $$;
