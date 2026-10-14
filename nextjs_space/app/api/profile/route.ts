export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, json, can, canToggleNsfw, type Viewer } from '@/lib/access';
import { ACCENT_THEMES, FEATURED_CARD_MAX, USERNAME_RE, applyBadgePrefs, isAccentTheme, sanitizeBadgePrefs, sanitizeBannerNameSize, sanitizeBgType, sanitizeCardOpacity, sanitizeMediaUrl, sanitizeProfileStyle, sanitizeSongUrl } from '@/lib/profile';
import { readProfileExtras, writeProfileExtras } from '@/lib/profile-style';
import { profileStats, profileBadges, findUserByUsername, pinIds } from '@/lib/profile-server';
import { characterImpliesNsfw } from '@/lib/nsfw-notice';
import { adultCardsEnabled, writeAccountNsfwEnabled } from '@/lib/nsfw-account';

const MAX_PINS = FEATURED_CARD_MAX;

async function payload(viewer: Viewer) {
  const userId = viewer.user.id;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const stats = await profileStats(userId);
  const showNsfw = await adultCardsEnabled(viewer);
  const extras = await readProfileExtras(userId);
  const characters = await prisma.character.findMany({
    where: { ownerId: userId },
    select: { id: true, name: true, avatar: true, title: true, nsfw: true, summary: true, personality: true, scenario: true, initialMessage: true, tags: true, banner: true, creator: true, ownerId: true, visibility: true, moderated: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
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
    vipThemes: can(viewer, 'vipThemes'),
    sovereignUnlocked: viewer.isAdmin || viewer.isCreatorAdmin,
    subscribed: canToggleNsfw(viewer),
    nsfwEnabled: showNsfw,
    profileSongUrl: extras.profileSongUrl,
    profileStyle: extras.profileStyle,
    badgePrefs: extras.badgePrefs,
    bannerNameSize: extras.bannerNameSize,
    bannerNameColor: extras.bannerNameColor,
    bannerNameGlow: extras.bannerNameGlow,
    profileBgType: extras.profileBgType,
    profileBgUrl: extras.profileBgUrl,
    profileBgVideoUrl: extras.profileBgVideoUrl,
    profileCardOpacity: extras.profileCardOpacity,
    bannerMediaType: extras.bannerMediaType,
    bannerVideoUrl: extras.bannerVideoUrl,
    badges: applyBadgePrefs(profileBadges(user, stats), extras.badgePrefs),
    earnedBadges: profileBadges(user, stats),
    characters: characters.flatMap((c) => {
      const flagged = c.nsfw || characterImpliesNsfw(c);
      if (!showNsfw && flagged) return [];
      return [{
        id: c.id, name: c.name, avatar: c.avatar, title: c.title, summary: c.summary, banner: c.banner, updatedAt: c.updatedAt,
        creator: c.creator, ownerId: c.ownerId, visibility: c.visibility, moderated: c.moderated,
        nsfw: flagged,
        hiddenFromPublic: flagged && showNsfw,
        tags: c.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      }];
    }),
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
    if (body?.banner !== undefined || body?.bannerImageUrl !== undefined) {
      const imageUrl = body?.bannerImageUrl !== undefined ? body.bannerImageUrl : body.banner;
      const clean = typeof imageUrl === 'string' ? imageUrl.trim().slice(0, 1000) : '';
      data.banner = clean || null;
    }
    if (body?.bannerAnimated !== undefined) data.bannerAnimated = !!body.bannerAnimated;
    if (body?.bannerPositionY !== undefined) {
      const n = Number(body.bannerPositionY);
      data.bannerPositionY = Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
    }
    if (body?.accentTheme !== undefined) {
      const theme: unknown = body.accentTheme;
      if (!isAccentTheme(theme)) return json({ error: 'Unknown accent theme' }, 400);
      if (ACCENT_THEMES[theme].sovereign && !viewer.isAdmin && !viewer.isCreatorAdmin) {
        return json({ error: 'Creator Accent — Reserved for Platform Sovereign / Admin' }, 403);
      }
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

    const extrasTouched = ['profileSongUrl', 'profileStyle', 'badgePrefs', 'bannerNameSize', 'bannerNameColor', 'bannerNameGlow', 'profileBgType', 'profileBgUrl', 'profileBgVideoUrl', 'profileCardOpacity', 'bannerMediaType', 'bannerVideoUrl'].some((key) => body?.[key] !== undefined);
    if (extrasTouched) {
      const current = await readProfileExtras(viewer.user.id);
      await writeProfileExtras(viewer.user.id, {
        profileSongUrl: body?.profileSongUrl !== undefined ? sanitizeSongUrl(body.profileSongUrl) : current.profileSongUrl,
        profileStyle: body?.profileStyle !== undefined ? sanitizeProfileStyle(body.profileStyle) : current.profileStyle,
        badgePrefs: body?.badgePrefs !== undefined ? sanitizeBadgePrefs(body.badgePrefs) : current.badgePrefs,
        bannerNameSize: body?.bannerNameSize !== undefined ? sanitizeBannerNameSize(body.bannerNameSize) : current.bannerNameSize,
        bannerNameColor: body?.bannerNameColor !== undefined ? String(body.bannerNameColor ?? '') : current.bannerNameColor,
        bannerNameGlow: body?.bannerNameGlow !== undefined ? !!body.bannerNameGlow : current.bannerNameGlow,
        profileBgType: body?.profileBgType !== undefined ? sanitizeBgType(body.profileBgType) : current.profileBgType,
        profileBgUrl: body?.profileBgUrl !== undefined ? sanitizeMediaUrl(body.profileBgUrl) : current.profileBgUrl,
        profileBgVideoUrl: body?.profileBgVideoUrl !== undefined ? sanitizeMediaUrl(body.profileBgVideoUrl) : current.profileBgVideoUrl,
        profileCardOpacity: body?.profileCardOpacity !== undefined ? sanitizeCardOpacity(body.profileCardOpacity) : current.profileCardOpacity,
        bannerMediaType: body?.bannerMediaType !== undefined ? sanitizeBgType(body.bannerMediaType) : current.bannerMediaType,
        bannerVideoUrl: body?.bannerVideoUrl !== undefined ? sanitizeMediaUrl(body.bannerVideoUrl) : current.bannerVideoUrl,
      });
    }

    if (typeof body?.nsfwEnabled === 'boolean') {
      if (body.nsfwEnabled && !canToggleNsfw(viewer)) {
        return json({ error: 'Requires Active Subscription to Enable', code: 'NSFW_LOCKED' }, 403);
      }
      await writeAccountNsfwEnabled(viewer.user.id, body.nsfwEnabled);
    }

    await prisma.user.update({ where: { id: viewer.user.id }, data });
    return json(await payload(viewer));
  } catch (err: any) {
    console.error('PUT /api/profile error:', err);
    return json({ error: err?.message ?? 'Failed to save profile' }, 500);
  }
}
