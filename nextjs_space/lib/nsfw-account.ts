import { prisma } from '@/lib/db';
import { canViewNsfw, type Viewer } from '@/lib/access';

function asFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 't' || value === 'true';
}

/** Saved profile preference. Missing column or row stays off. */
export async function readAccountNsfwEnabled(userId: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ nsfwEnabled: unknown }>>`
      SELECT "nsfwEnabled" FROM "User" WHERE id = ${userId}
    `;
    return asFlag(rows[0]?.nsfwEnabled);
  } catch (err) {
    console.warn('nsfwEnabled preference is unavailable');
    return false;
  }
}

export async function writeAccountNsfwEnabled(userId: string, on: boolean): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "User" SET "nsfwEnabled" = ${on} WHERE id = ${userId}
  `;
}

/** Adult cards are included only for an active NSFW plan with the profile setting on. */
export async function adultCardsEnabled(viewer: Viewer | null): Promise<boolean> {
  if (!viewer || !canViewNsfw(viewer)) return false;
  return readAccountNsfwEnabled(viewer.user.id);
}
