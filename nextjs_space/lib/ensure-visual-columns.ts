import 'server-only';
import { prisma } from '@/lib/db';

/**
 * Production DBs that predate the VLM upgrade are missing these nullable columns.
 * Prisma then fails every Character/Persona findMany with "column does not exist",
 * which makes the gallery and personas hubs look empty.
 *
 * App tables live in the `nexus` schema (see nsfw-account, comments, lore migrations).
 * This only ADDS missing columns. It never drops, truncates, or deletes rows.
 */
let ensured: Promise<void> | null = null;

async function addNexusColumn(table: 'Character' | 'Persona', column: string, sqlType: string) {
  // IF NOT EXISTS keeps this idempotent across deploys and concurrent requests.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE nexus."${table}" ADD COLUMN IF NOT EXISTS "${column}" ${sqlType}`,
  );
}

async function ensureOnce(): Promise<void> {
  await addNexusColumn('Character', 'visualDescription', 'TEXT');
  await addNexusColumn('Character', 'visualAnchor', 'TEXT');
  await addNexusColumn('Character', 'visualAnalyzedFor', "TEXT NOT NULL DEFAULT ''");

  await addNexusColumn('Persona', 'visualDescription', 'TEXT');
  await addNexusColumn('Persona', 'visualAnchor', 'TEXT');
  await addNexusColumn('Persona', 'visualAnalyzedFor', "TEXT NOT NULL DEFAULT ''");

  // Supabase sync mirrors (public snake_case) — also additive only.
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'characters'
      ) THEN
        ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS visual_description text;
        ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS visual_anchor text;
        ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS visual_analyzed_for text NOT NULL DEFAULT '';
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'personas'
      ) THEN
        ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS visual_description text;
        ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS visual_anchor text;
        ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS visual_analyzed_for text NOT NULL DEFAULT '';
      END IF;
    END $$;
  `);
}

export async function ensureVisualColumns(): Promise<void> {
  if (!ensured) {
    ensured = ensureOnce().catch((err) => {
      ensured = null;
      throw err;
    });
  }
  await ensured;
}
