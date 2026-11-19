-- Chat sessions must default to the configured NovelAI Llama 3 Erato model, not Gemini.
-- Prisma ChatSession table (when mirrored / managed alongside Supabase):
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ChatSession' and column_name = 'model'
  ) then
    execute 'alter table public."ChatSession" alter column model set default ''llama-3-erato-v1''';
    execute 'alter table public."ChatSession" alter column provider set default ''NOVELAI''';
    execute $sql$
      update public."ChatSession"
      set model = 'llama-3-erato-v1', provider = 'NOVELAI'
      where provider = 'GEMINI'
         or model ilike '%gemini%'
         or model ilike '%gemma%'
    $sql$;
  end if;
end $$;

-- Cloud sync chats table
alter table if exists public.chats alter column model set default 'llama-3-erato-v1';
alter table if exists public.chats alter column provider set default 'NOVELAI';

update public.chats
set model = 'llama-3-erato-v1', provider = 'NOVELAI'
where provider = 'GEMINI'
   or model ilike '%gemini%'
   or model ilike '%gemma%'
   or coalesce(trim(model), '') = ''
   or coalesce(trim(provider), '') = '';
