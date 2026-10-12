import { prisma } from '@/lib/db';
import { isAdminUser, effectiveTier } from '@/lib/access';
import { TIERS } from '@/lib/tiers';
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

export async function profileStats(userId: string, opts?: { publicOnly?: boolean }) {
  const [characters, loreEntries, lorebooks, personas, chats] = await Promise.all([
    prisma.character.count({
      where: opts?.publicOnly
        ? { ownerId: userId, visibility: 'PUBLIC', moderated: false }
        : { ownerId: userId },
    }),
    prisma.loreEntry.count({ where: { lorebook: { userId } } }),
    prisma.lorebook.count({ where: { userId } }),
    prisma.persona.count({ where: { userId } }),
    prisma.chatSession.count({ where: { character: { ownerId: userId } } }),
  ]);
  return { characters, loreEntries, lorebooks, personas, chats };
}

export function profileBadges(user: User, stats: { characters: number; loreEntries: number }): ProfileBadge[] {
  const badges: ProfileBadge[] = [];
  const admin = isAdminUser(user);
  if (admin) badges.push({ id: 'ADMIN', label: 'Creator / Admin' });
  const tier = admin ? 'ULTIMATE' : effectiveTier(user);
  if (TIERS[tier].vipThemes) badges.push({ id: 'VIP', label: 'VIP Creator' });
  if (tier !== 'FREE' && !admin) badges.push({ id: 'TIER', label: `${TIERS[tier].name} Member` });
  if (stats.characters >= WORLDBUILDER_MIN_CARDS || stats.loreEntries >= WORLDBUILDER_MIN_ENTRIES) {
    badges.push({ id: 'WORLDBUILDER', label: 'Master Worldbuilder' });
  }
  return badges;
}

export async function findUserByUsername(username: string) {
  return prisma.user.findFirst({ where: { username: username.toLowerCase() } });
}
