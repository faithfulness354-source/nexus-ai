-- Atomic daily text/image credit consume + refund helpers for nexus."User".
-- Additive only: CREATE OR REPLACE FUNCTION. Never drops tables or deletes rows.

create schema if not exists nexus;

create or replace function nexus.consume_daily_credit(p_user_id text, p_day text, p_limit integer)
returns boolean
language plpgsql
as $$
declare
  rows_updated integer;
begin
  update nexus."User"
  set "creditsDay" = p_day, "creditsUsed" = 1
  where id = p_user_id and ("creditsDay" is distinct from p_day);
  get diagnostics rows_updated = row_count;
  if rows_updated > 0 then
    return true;
  end if;

  if p_limit is null or p_limit < 0 then
    update nexus."User"
    set "creditsUsed" = "creditsUsed" + 1
    where id = p_user_id and "creditsDay" = p_day;
    get diagnostics rows_updated = row_count;
    return rows_updated > 0;
  end if;

  update nexus."User"
  set "creditsUsed" = "creditsUsed" + 1
  where id = p_user_id and "creditsDay" = p_day and "creditsUsed" < p_limit;
  get diagnostics rows_updated = row_count;
  return rows_updated > 0;
end;
$$;

create or replace function nexus.refund_daily_credit(p_user_id text, p_day text)
returns void
language plpgsql
as $$
begin
  update nexus."User"
  set "creditsUsed" = "creditsUsed" - 1
  where id = p_user_id and "creditsDay" = p_day and "creditsUsed" > 0;
end;
$$;

create or replace function nexus.consume_image_credit(p_user_id text, p_day text, p_limit integer)
returns boolean
language plpgsql
as $$
declare
  rows_updated integer;
begin
  if p_limit is null or p_limit <= 0 then
    return false;
  end if;

  update nexus."User"
  set "imageCreditsDay" = p_day, "imageCreditsUsed" = 1
  where id = p_user_id and ("imageCreditsDay" is distinct from p_day);
  get diagnostics rows_updated = row_count;
  if rows_updated > 0 then
    return true;
  end if;

  update nexus."User"
  set "imageCreditsUsed" = "imageCreditsUsed" + 1
  where id = p_user_id and "imageCreditsDay" = p_day and "imageCreditsUsed" < p_limit;
  get diagnostics rows_updated = row_count;
  return rows_updated > 0;
end;
$$;

create or replace function nexus.refund_image_credit(p_user_id text, p_day text)
returns void
language plpgsql
as $$
begin
  update nexus."User"
  set "imageCreditsUsed" = "imageCreditsUsed" - 1
  where id = p_user_id and "imageCreditsDay" = p_day and "imageCreditsUsed" > 0;
end;
$$;
