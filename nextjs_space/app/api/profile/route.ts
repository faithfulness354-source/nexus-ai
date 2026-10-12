export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, json, can, type Viewer } from '@/lib/access';
import { ACCENT_THEMES, USERNAME_RE, isAccentTheme } from '@/lib/profile';
import { profileStats, profileBadges, findUserByUsername, pinIds } from '@/lib/profile-server';
import { characterImpliesNsfw } from '@/lib/nsfw-notice';

const MAX_PINS = 6;

async function payload(viewer: Viewer) {
  const userId = viewer.user.id;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const stats = await profileStats(userId);
  const characters = await prisma.character.findMany({
    where: { ownerId: userId },
    select: { id: true, name: true, avatar: true, title: true, nsfw: true, summary: true, personality: true, scenario: true, initialMessage: true, tags: true, banner: true, creator: true, ownerId: true, visibility: true, moderated: true },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });
  return {
    username: user.username,
    displayName: user.displayName,
    image: user.image,
    bio: user.bio,
    banner: user.banner,
    bannerAnimated: user.bannerAnimated,
    bannerPositionY: user.bannerPositionY || 15,
    accentTheme: user.accentTheme,
    pinnedCharacterIds: pinIds(user.pinnedCharacterIds),
    email: user.email,
    stats,
    badges: profileBadges(user, stats),
    vipThemes: can(viewer, 'vipThemes'),
    characters: characters.map((c) => ({
      id: c.id, name: c.name, avatar: c.avatar, title: c.title, summary: c.summary, banner: c.banner,
      creator: c.creator, ownerId: c.ownerId, visibility: c.visibility, moderated: c.moderated,
      nsfw: c.nsfw || characterImpliesNsfw(c),
      tags: c.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    })),
  };
}

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  return json(await payload(viewer));
}

export async function PUT(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  try {
    const body = await request.json().catch(() => ({}));
    const data: Record<string, unknown> = {};

    if (body?.username !== undefined) {
      const username = String(body.username ?? '').trim().toLowerCase();
      if (!username) data.username = null;
      else {
        if (!USERNAME_RE.test(username)) return json({ error: 'Usernames are 3–24 characters: letters, numbers and underscores.' }, 400);
        const taken = await findUserByUsername(username);
        if (taken && taken.id !== viewer.user.id) return json({ error: `@${username} is already taken.` }, 409);
        data.username = username;
      }
    }
    if (body?.displayName !== undefined) data.displayName = String(body.displayName ?? '').trim().slice(0, 60) || null;
    if (body?.bio !== undefined) data.bio = String(body.bio ?? '').slice(0, 20000);
    if (body?.image !== undefined) data.image = typeof body.image === 'string' && body.image.trim() ? body.image.trim().slice(0, 1000) : null;
    if (body?.banner !== undefined) data.banner = typeof body.banner === 'string' && body.banner.trim() ? body.banner.trim().slice(0, 1000) : null;
    if (body?.bannerAnimated !== undefined) data.bannerAnimated = !!body.bannerAnimated;
    if (body?.bannerPositionY !== undefined) {
      const n = Number(body.bannerPositionY);
      data.bannerPositionY = Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
    }
    if (body?.accentTheme !== undefined) {
      const theme: unknown = body.accentTheme;
      if (!isAccentTheme(theme)) return json({ error: 'Unknown accent theme' }, 400);
      if (ACCENT_THEMES[theme].vip && theme !== viewer.user.accentTheme && !can(viewer, 'vipThemes')) {
        return json({ error: 'VIP profile themes are part of the Ultimate plan.', code: 'UPGRADE_REQUIRED', feature: 'vipThemes' }, 402);
      }
      data.accentTheme = theme;
    }
    if (body?.pinnedCharacterIds !== undefined) {
      const wanted = Array.isArray(body.pinnedCharacterIds) ? Array.from(new Set(body.pinnedCharacterIds.filter((x: unknown) => typeof x === 'string'))) as string[] : [];
      const owned = await prisma.character.findMany({ where: { id: { in: wanted }, ownerId: viewer.user.id }, select: { id: true } });
      const ok = new Set(owned.map((c) => c.id));
      data.pinnedCharacterIds = JSON.stringify(wanted.filter((id) => ok.has(id)).slice(0, MAX_PINS));
    }

    await prisma.user.update({ where: { id: viewer.user.id }, data });
    return json(await payload(viewer));
  } catch (err: any) {
    console.error('PUT /api/profile error:', err);
    return json({ error: err?.message ?? 'Failed to save profile' }, 500);
  }
}
