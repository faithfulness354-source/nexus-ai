import 'server-only';
import { prisma } from '@/lib/db';
import { DEFAULT_CHARACTERS } from '@/lib/default-cards';

let pending: Promise<boolean> | null = null;

function productionRuntime(): boolean {
  if (process.env.NEXT_PHASE === 'phase-production-build') return false;
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

async function seedIfEmpty(): Promise<boolean> {
  const count = await prisma.character.count();
  if (count > 0) return false;
  for (const card of DEFAULT_CHARACTERS) {
    await prisma.character.upsert({
      where: { id: card.id },
      update: {},
      create: card,
    });
  }
  console.warn('Production catalog was empty. Seeded the default character cards.');
  return true;
}

/** Inserts the starter cards only when production has no characters. Failures leave the request empty. */
export function ensureDefaultCards(): Promise<boolean> {
  if (!productionRuntime()) return Promise.resolve(false);
  if (!pending) {
    pending = seedIfEmpty().catch((error) => {
      console.warn('Default character seed skipped', error instanceof Error ? error.message : '');
      return false;
    }).finally(() => {
      pending = null;
    });
  }
  return pending;
}
