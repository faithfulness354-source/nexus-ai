import { prisma } from '@/lib/db';
import { isAdminUser, effectiveTier } from '@/lib/access';
import { TIERS, type TierId } from '@/lib/tiers';
import { WORLDBUILDER_MIN_CARDS, WORLDBUILDER_MIN_ENTRIES, type ProfileBadge } from '@/lib/profile';
import type { User } from '@prisma/client';

/** Stored as JSON text. Missing or unreadable pins are an empty list. */
export function pinIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((id): id is string => typeof id === 'string');
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    return pinIds(JSON.parse(value));
  } catch {
    return [];
  }
}

async function safeCount(label: string, run: () => Promise<number>): Promise<number> {
  try {
    return await run();
  } catch (err) {
    console.warn(`[profileStats] ${label}:`, err instanceof Error ? err.message : err);
    return 0;
  }
}

export async function profileStats(userId: string, opts?: { publicOnly?: boolean }) {
  const [characters, loreEntries, lorebooks, personas, chats] = await Promise.all([
    safeCount('characters', () => prisma.character.count({
      where: opts?.publicOnly
        ? { ownerId: userId, visibility: 'PUBLIC', moderated: false }
        : { ownerId: userId },
    })),
    safeCount('loreEntries', () => prisma.loreEntry.count({ where: { lorebook: { userId } } })),
    safeCount('lorebooks', () => prisma.lorebook.count({ where: { userId } })),
    safeCount('personas', () => prisma.persona.count({ where: { userId } })),
    safeCount('chats', () => prisma.chatSession.count({ where: { character: { ownerId: userId } } })),
  ]);
  return { characters, loreEntries, lorebooks, personas, chats };
}

function asTierId(value: unknown): TierId {
  return value === 'PLUS' || value === 'PREMIUM' || value === 'ULTIMATE' || value === 'FREE'
    ? value
    : 'FREE';
}

export function profileBadges(
  user: Pick<User, 'role' | 'isWhitelisted' | 'email' | 'tier' | 'subscriptionStatus' | 'currentPeriodEnd'>,
  stats: { characters: number; loreEntries: number },
): ProfileBadge[] {
  try {
    const badges: ProfileBadge[] = [];
    const admin = isAdminUser(user);
    if (admin) badges.push({ id: 'ADMIN', label: 'Creator / Admin' });
    const tier = admin ? 'ULTIMATE' : asTierId(effectiveTier(user));
    const def = TIERS[tier] ?? TIERS.FREE;
    if (def.vipThemes) badges.push({ id: 'VIP', label: 'VIP Creator' });
    if (tier !== 'FREE' && !admin) badges.push({ id: 'TIER', label: `${def.name} Member` });
    if (stats.characters >= WORLDBUILDER_MIN_CARDS || stats.loreEntries >= WORLDBUILDER_MIN_ENTRIES) {
      badges.push({ id: 'WORLDBUILDER', label: 'Master Worldbuilder' });
    }
    return badges;
  } catch (err) {
    console.warn('[profileBadges] failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/** Columns required to render a public profile — avoid selecting fields that may be missing in older DBs. */
export const PROFILE_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  isWhitelisted: true,
  tier: true,
  subscriptionStatus: true,
  currentPeriodEnd: true,
  username: true,
  displayName: true,
  image: true,
  bio: true,
  banner: true,
  bannerAnimated: true,
  bannerPositionY: true,
  accentTheme: true,
  pinnedCharacterIds: true,
} as const;

/** Even narrower select when optional profile columns are missing from the live DB. */
const PROFILE_USER_SELECT_MIN = {
  id: true,
  email: true,
  role: true,
  isWhitelisted: true,
  tier: true,
  subscriptionStatus: true,
  currentPeriodEnd: true,
  username: true,
  displayName: true,
  image: true,
  bio: true,
  banner: true,
} as const;

export type ProfileUser = {
  id: string;
  email: string;
  role: User['role'];
  isWhitelisted: boolean;
  tier: User['tier'];
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  username: string | null;
  displayName: string | null;
  image: string | null;
  bio: string;
  banner: string | null;
  bannerAnimated: boolean;
  bannerPositionY: number;
  accentTheme: string;
  pinnedCharacterIds: string | null;
};

function normalizeHandle(username: string): string {
  return decodeURIComponent(username || '').trim().replace(/^@+/, '').toLowerCase();
}

/** Letters+digits only so entityxil4 matches ENTITY-XIL4 / entity_xil4. */
export function slugKey(value: string): string {
  return normalizeHandle(value).replace(/[^a-z0-9]/g, '');
}

function mapRawUser(row: Record<string, unknown>, fallbackHandle?: string): ProfileUser | null {
  const id = typeof row.id === 'string' ? row.id : '';
  if (!id) return null;
  const username =
    typeof row.username === 'string' && row.username.trim()
      ? row.username.trim().toLowerCase()
      : (fallbackHandle || null);
  return {
    id,
    email: typeof row.email === 'string' ? row.email : '',
    role: (row.role as User['role']) || 'USER',
    isWhitelisted: row.isWhitelisted === true || row.isWhitelisted === 't' || row.isWhitelisted === 1,
    tier: asTierId(row.tier) as User['tier'],
    subscriptionStatus: typeof row.subscriptionStatus === 'string' ? row.subscriptionStatus : null,
    currentPeriodEnd: row.currentPeriodEnd instanceof Date
      ? row.currentPeriodEnd
      : (typeof row.currentPeriodEnd === 'string' || typeof row.currentPeriodEnd === 'number'
        ? new Date(row.currentPeriodEnd)
        : null),
    username,
    displayName: typeof row.displayName === 'string' ? row.displayName : null,
    image: typeof row.image === 'string' ? row.image : null,
    bio: typeof row.bio === 'string' ? row.bio : '',
    banner: typeof row.banner === 'string' ? row.banner : null,
    bannerAnimated: row.bannerAnimated !== false && row.bannerAnimated !== 'f' && row.bannerAnimated !== 0,
    bannerPositionY: typeof row.bannerPositionY === 'number' ? row.bannerPositionY : Number(row.bannerPositionY) || 15,
    accentTheme: typeof row.accentTheme === 'string' && row.accentTheme ? row.accentTheme : 'OBSIDIAN',
    pinnedCharacterIds: typeof row.pinnedCharacterIds === 'string' ? row.pinnedCharacterIds : null,
  };
}

function asProfileUser(row: Record<string, unknown> | null | undefined, fallbackHandle?: string): ProfileUser | null {
  if (!row) return null;
  return mapRawUser(row, fallbackHandle);
}

async function loadUserById(id: string, fallbackHandle?: string): Promise<ProfileUser | null> {
  if (!id) return null;
  try {
    const row = await prisma.user.findUnique({ where: { id }, select: PROFILE_USER_SELECT });
    if (row) return asProfileUser(row as unknown as Record<string, unknown>, fallbackHandle);
  } catch (err) {
    console.warn('[loadUserById] full select failed:', err instanceof Error ? err.message : err);
  }
  try {
    const row = await prisma.user.findUnique({ where: { id }, select: PROFILE_USER_SELECT_MIN });
    if (row) {
      return asProfileUser({
        ...row,
        bannerAnimated: true,
        bannerPositionY: 15,
        accentTheme: 'OBSIDIAN',
        pinnedCharacterIds: null,
      } as unknown as Record<string, unknown>, fallbackHandle);
    }
  } catch (err) {
    console.warn('[loadUserById] min select failed:', err instanceof Error ? err.message : err);
  }

  for (const sql of [
    `SELECT id, email, role, "isWhitelisted", tier, "subscriptionStatus", "currentPeriodEnd",
            username, "displayName", image, bio, banner, "bannerAnimated", "bannerPositionY",
            "accentTheme", "pinnedCharacterIds"
     FROM nexus."User" WHERE id = $1 LIMIT 1`,
    `SELECT id, email, role, "isWhitelisted", tier, "subscriptionStatus", "currentPeriodEnd",
            username, "displayName", image, bio, banner
     FROM nexus."User" WHERE id = $1 LIMIT 1`,
    `SELECT id, email, role, "isWhitelisted", tier, "subscriptionStatus", "currentPeriodEnd",
            username, "displayName", image, bio, banner, "bannerAnimated", "bannerPositionY",
            "accentTheme", "pinnedCharacterIds"
     FROM public."User" WHERE id = $1 LIMIT 1`,
  ]) {
    try {
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, id);
      const mapped = rows[0] ? mapRawUser(rows[0], fallbackHandle) : null;
      if (mapped) return mapped;
    } catch (err) {
      console.warn('[loadUserById] raw skipped:', err instanceof Error ? err.message.slice(0, 180) : err);
    }
  }
  return null;
}

/**
 * Exact username lookup for uniqueness checks (no creator-slug fallback).
 */
export async function findUserByUsername(username: string): Promise<ProfileUser | null> {
  const handle = normalizeHandle(username);
  if (!handle) return null;

  try {
    const row = await prisma.user.findFirst({
      where: { username: { equals: handle, mode: 'insensitive' } },
      select: PROFILE_USER_SELECT,
    });
    if (row) return asProfileUser(row as unknown as Record<string, unknown>);
  } catch (err) {
    console.warn(
      '[findUserByUsername] prisma select failed, trying raw:',
      err instanceof Error ? err.message : err,
    );
  }

  for (const sql of [
    `SELECT id, email, role, "isWhitelisted", tier, "subscriptionStatus", "currentPeriodEnd",
            username, "displayName", image, bio, banner, "bannerAnimated", "bannerPositionY",
            "accentTheme", "pinnedCharacterIds"
     FROM nexus."User" WHERE lower(username) = $1 LIMIT 1`,
    `SELECT id, email, role, "isWhitelisted", tier, "subscriptionStatus", "currentPeriodEnd",
            username, "displayName", image, bio, banner, "bannerAnimated", "bannerPositionY",
            "accentTheme", "pinnedCharacterIds"
     FROM public."User" WHERE lower(username) = $1 LIMIT 1`,
  ]) {
    try {
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, handle);
      const mapped = rows[0] ? mapRawUser(rows[0]) : null;
      if (mapped) return mapped;
    } catch (err) {
      console.warn(
        '[findUserByUsername] raw lookup skipped:',
        err instanceof Error ? err.message.slice(0, 180) : err,
      );
    }
  }

  return null;
}

async function findOwnerIdByCreatorSlug(key: string): Promise<string | null> {
  if (!key || key.length < 3) return null;
  for (const sql of [
    `SELECT "ownerId" AS id FROM nexus."Character"
     WHERE "ownerId" IS NOT NULL
       AND lower(regexp_replace(coalesce(creator, ''), '[^a-zA-Z0-9]', '', 'g')) = $1
     ORDER BY "updatedAt" DESC NULLS LAST
     LIMIT 1`,
    `SELECT "ownerId" AS id FROM public."Character"
     WHERE "ownerId" IS NOT NULL
       AND lower(regexp_replace(coalesce(creator, ''), '[^a-zA-Z0-9]', '', 'g')) = $1
     ORDER BY "updatedAt" DESC NULLS LAST
     LIMIT 1`,
  ]) {
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ id?: string | null }>>(sql, key);
      const id = rows[0]?.id;
      if (typeof id === 'string' && id) return id;
    } catch (err) {
      console.warn(
        '[resolvePublicProfile] creator slug lookup skipped:',
        err instanceof Error ? err.message.slice(0, 180) : err,
      );
    }
  }

  // Prisma fallback when regexp_replace is unavailable.
  try {
    const rows = await prisma.character.findMany({
      where: {
        AND: [
          { ownerId: { not: '' } },
          { creator: { not: '' } },
        ],
      },
      select: { ownerId: true, creator: true },
      orderBy: { updatedAt: 'desc' },
      take: 400,
    });
    const hit = rows.find((row) => row.ownerId && slugKey(String(row.creator || '')) === key);
    return hit?.ownerId ?? null;
  } catch (err) {
    console.warn(
      '[resolvePublicProfile] prisma creator scan failed:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Resolve a public /u/[username] page.
 * 1) exact User.username
 * 2) slug-normalized username (entity-xil4 ↔ entityxil4)
 * 3) Character.creator slug → owner (covers accounts that never set username)
 */
export async function resolvePublicProfile(username: string): Promise<ProfileUser | null> {
  const handle = normalizeHandle(username);
  if (!handle) return null;
  const key = slugKey(handle);

  const byUsername = await findUserByUsername(handle);
  if (byUsername) return byUsername;

  // Slug-normalized username match (hyphens/underscores ignored).
  if (key) {
    for (const sql of [
      `SELECT id, email, role, "isWhitelisted", tier, "subscriptionStatus", "currentPeriodEnd",
              username, "displayName", image, bio, banner, "bannerAnimated", "bannerPositionY",
              "accentTheme", "pinnedCharacterIds"
       FROM nexus."User"
       WHERE username IS NOT NULL
         AND lower(regexp_replace(username, '[^a-zA-Z0-9]', '', 'g')) = $1
       LIMIT 1`,
      `SELECT id, email, role, "isWhitelisted", tier, "subscriptionStatus", "currentPeriodEnd",
              username, "displayName", image, bio, banner, "bannerAnimated", "bannerPositionY",
              "accentTheme", "pinnedCharacterIds"
       FROM public."User"
       WHERE username IS NOT NULL
         AND lower(regexp_replace(username, '[^a-zA-Z0-9]', '', 'g')) = $1
       LIMIT 1`,
    ]) {
      try {
        const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, key);
        const mapped = rows[0] ? mapRawUser(rows[0], handle) : null;
        if (mapped) return mapped;
      } catch (err) {
        console.warn(
          '[resolvePublicProfile] slug username skipped:',
          err instanceof Error ? err.message.slice(0, 180) : err,
        );
      }
    }
  }

  const ownerId = await findOwnerIdByCreatorSlug(key);
  if (!ownerId) {
    console.warn(`[resolvePublicProfile] no user/creator match for handle=${handle} key=${key}`);
    return null;
  }

  const owner = await loadUserById(ownerId, key || handle);
  if (!owner) {
    console.warn(`[resolvePublicProfile] owner ${ownerId} for creator slug ${key} could not be loaded`);
    return null;
  }

  // Prefer a stable public handle: stored username, else the URL slug.
  if (!owner.username) owner.username = key || handle;
  console.info(`[resolvePublicProfile] resolved ${handle} via creator slug → ${owner.id}`);
  return owner;
}
