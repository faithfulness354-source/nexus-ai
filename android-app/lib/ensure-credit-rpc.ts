import 'server-only';
import { prisma } from '@/lib/db';

/**
 * Idempotent SQL helpers for atomic daily credit consume/refund on nexus."User".
 * Never drops tables or deletes rows — CREATE OR REPLACE FUNCTION only.
 */
let ensured: Promise<void> | null = null;

const CONSUME_TEXT = `
CREATE OR REPLACE FUNCTION nexus.consume_daily_credit(p_user_id text, p_day text, p_limit integer)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  rows_updated integer;
BEGIN
  -- New UTC day: reset counter to 1 atomically.
  UPDATE nexus."User"
  SET "creditsDay" = p_day, "creditsUsed" = 1
  WHERE id = p_user_id AND ("creditsDay" IS DISTINCT FROM p_day);
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  IF rows_updated > 0 THEN
    RETURN true;
  END IF;

  IF p_limit IS NULL OR p_limit < 0 THEN
    UPDATE nexus."User"
    SET "creditsUsed" = "creditsUsed" + 1
    WHERE id = p_user_id AND "creditsDay" = p_day;
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    RETURN rows_updated > 0;
  END IF;

  UPDATE nexus."User"
  SET "creditsUsed" = "creditsUsed" + 1
  WHERE id = p_user_id AND "creditsDay" = p_day AND "creditsUsed" < p_limit;
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$;
`;

const REFUND_TEXT = `
CREATE OR REPLACE FUNCTION nexus.refund_daily_credit(p_user_id text, p_day text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE nexus."User"
  SET "creditsUsed" = "creditsUsed" - 1
  WHERE id = p_user_id AND "creditsDay" = p_day AND "creditsUsed" > 0;
END;
$$;
`;

const CONSUME_IMAGE = `
CREATE OR REPLACE FUNCTION nexus.consume_image_credit(p_user_id text, p_day text, p_limit integer)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  rows_updated integer;
BEGIN
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RETURN false;
  END IF;

  UPDATE nexus."User"
  SET "imageCreditsDay" = p_day, "imageCreditsUsed" = 1
  WHERE id = p_user_id AND ("imageCreditsDay" IS DISTINCT FROM p_day);
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  IF rows_updated > 0 THEN
    RETURN true;
  END IF;

  UPDATE nexus."User"
  SET "imageCreditsUsed" = "imageCreditsUsed" + 1
  WHERE id = p_user_id AND "imageCreditsDay" = p_day AND "imageCreditsUsed" < p_limit;
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$;
`;

const REFUND_IMAGE = `
CREATE OR REPLACE FUNCTION nexus.refund_image_credit(p_user_id text, p_day text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE nexus."User"
  SET "imageCreditsUsed" = "imageCreditsUsed" - 1
  WHERE id = p_user_id AND "imageCreditsDay" = p_day AND "imageCreditsUsed" > 0;
END;
$$;
`;

async function ensureOnce(): Promise<void> {
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS nexus`);
  await prisma.$executeRawUnsafe(CONSUME_TEXT);
  await prisma.$executeRawUnsafe(REFUND_TEXT);
  await prisma.$executeRawUnsafe(CONSUME_IMAGE);
  await prisma.$executeRawUnsafe(REFUND_IMAGE);
}

export async function ensureCreditRpcs(): Promise<void> {
  if (!ensured) {
    ensured = ensureOnce().catch((err) => {
      ensured = null;
      throw err;
    });
  }
  await ensured;
}
