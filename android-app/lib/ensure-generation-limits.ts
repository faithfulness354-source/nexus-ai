import 'server-only';
import { prisma } from '@/lib/db';

/**
 * Additive tables for reroll counters + per-user cooldowns.
 * Never drops or truncates existing app data.
 */
let ensured: Promise<void> | null = null;

const DDL = `
CREATE TABLE IF NOT EXISTS public.scene_generation_state (
  message_id text PRIMARY KEY,
  user_id text NOT NULL,
  generation_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.text_swipe_state (
  turn_id text PRIMARY KEY,
  session_id text NOT NULL,
  user_id text NOT NULL,
  swipe_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.generation_cooldowns (
  user_id text NOT NULL,
  kind text NOT NULL,
  last_at timestamptz NOT NULL DEFAULT now(),
  in_flight boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, kind)
);
`;

async function ensureOnce(): Promise<void> {
  await prisma.$executeRawUnsafe(DDL);
}

export async function ensureGenerationLimitTables(): Promise<void> {
  if (!ensured) {
    ensured = ensureOnce().catch((err) => {
      ensured = null;
      throw err;
    });
  }
  await ensured;
}
