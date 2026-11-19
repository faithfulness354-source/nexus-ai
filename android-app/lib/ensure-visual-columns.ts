import 'server-only';
import { prisma } from '@/lib/db';

/**
 * Production DBs that predate the VLM upgrade are missing these nullable columns.
 * Prisma then fails every Character/Persona findMany with "column does not exist",
 * which makes Discover and profile pages look empty / crash.
 *
 * App tables may live in `nexus` (search_path) and/or `public` depending on
 * DATABASE_URL. Heal every known location. Failures are logged and swallowed so
 * a single DDL permission blip cannot take down the gallery.
 *
 * This only ADDS missing columns. It never drops, truncates, or deletes rows.
 */
let ensured: Promise<void> | null = null;

async function tryExec(label: string, sql: string): Promise<boolean> {
  try {
    await prisma.$executeRawUnsafe(sql);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Missing table / schema is expected on some environments — keep going.
    if (!/already exists/i.test(message)) {
      console.warn(`[ensure-visual-columns] ${label}:`, message.slice(0, 240));
    }
    return false;
  }
}

async function ensureOnce(): Promise<void> {
  const characterCols: Array<[string, string]> = [
    ['visualDescription', 'TEXT'],
    ['visualAnchor', 'TEXT'],
    ['visualAnalyzedFor', "TEXT NOT NULL DEFAULT ''"],
  ];
  const personaCols = characterCols;

  // Prisma PascalCase tables in nexus (primary app schema on Supabase).
  for (const [column, sqlType] of characterCols) {
    await tryExec(
      `nexus.Character.${column}`,
      `ALTER TABLE nexus."Character" ADD COLUMN IF NOT EXISTS "${column}" ${sqlType}`,
    );
  }
  for (const [column, sqlType] of personaCols) {
    await tryExec(
      `nexus.Persona.${column}`,
      `ALTER TABLE nexus."Persona" ADD COLUMN IF NOT EXISTS "${column}" ${sqlType}`,
    );
  }

  // Same PascalCase names under public (DATABASE_URL without schema=nexus).
  for (const [column, sqlType] of characterCols) {
    await tryExec(
      `public.Character.${column}`,
      `ALTER TABLE public."Character" ADD COLUMN IF NOT EXISTS "${column}" ${sqlType}`,
    );
  }
  for (const [column, sqlType] of personaCols) {
    await tryExec(
      `public.Persona.${column}`,
      `ALTER TABLE public."Persona" ADD COLUMN IF NOT EXISTS "${column}" ${sqlType}`,
    );
  }

  // Supabase sync mirrors (snake_case) — additive only.
  await tryExec(
    'public.characters snake_case',
    `
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
    `,
  );
}

/** Heal VLM columns. Never throws — callers can always proceed to query/retry. */
export async function ensureVisualColumns(): Promise<void> {
  if (!ensured) {
    ensured = ensureOnce()
      .catch((err) => {
        ensured = null;
        console.warn(
          '[ensure-visual-columns] heal pass failed:',
          err instanceof Error ? err.message : err,
        );
      })
      .then(() => undefined);
  }
  await ensured;
}

/** True when Prisma failed because a column/table is missing (P2021/P2022). */
export function isMissingSchemaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code) : '';
  return (
    code === 'P2021'
    || code === 'P2022'
    || /column .* does not exist/i.test(message)
    || /The column .* does not exist in the current database/i.test(message)
    || /relation .* does not exist/i.test(message)
  );
}

/**
 * Run a Prisma read; on missing-column errors, re-heal and retry once.
 * Returns `fallback` instead of throwing when the retry still fails.
 */
export async function withVisualColumnRetry<T>(
  run: () => Promise<T>,
  fallback: T,
  label = 'query',
): Promise<T> {
  await ensureVisualColumns();
  try {
    return await run();
  } catch (err) {
    if (!isMissingSchemaError(err)) throw err;
    console.warn(`[${label}] missing column/table — re-healing and retrying`);
    ensured = null;
    await ensureVisualColumns();
    try {
      return await run();
    } catch (err2) {
      console.error(
        `[${label}] still failing after heal:`,
        err2 instanceof Error ? err2.message : err2,
      );
      return fallback;
    }
  }
}
