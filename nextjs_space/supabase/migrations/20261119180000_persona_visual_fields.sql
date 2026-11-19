-- VLM-cached persona / character visual fields for token-optimized chat injection.

alter table if exists public.personas
  add column if not exists visual_description text,
  add column if not exists visual_anchor text,
  add column if not exists visual_analyzed_for text not null default '';

alter table if exists public.characters
  add column if not exists visual_description text,
  add column if not exists visual_anchor text,
  add column if not exists visual_analyzed_for text not null default '';

-- Prisma app tables live in the nexus schema (search_path / DATABASE_URL).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'nexus' and table_name = 'Persona'
  ) then
    execute 'alter table nexus."Persona" add column if not exists "visualDescription" text';
    execute 'alter table nexus."Persona" add column if not exists "visualAnchor" text';
    execute 'alter table nexus."Persona" add column if not exists "visualAnalyzedFor" text not null default ''''';
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'nexus' and table_name = 'Character'
  ) then
    execute 'alter table nexus."Character" add column if not exists "visualDescription" text';
    execute 'alter table nexus."Character" add column if not exists "visualAnchor" text';
    execute 'alter table nexus."Character" add column if not exists "visualAnalyzedFor" text not null default ''''';
  end if;
end $$;
