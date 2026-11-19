import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getViewer, canEditCharacter } from '@/lib/access';
import { findUserByUsername, profileStats, profileBadges, pinIds } from '@/lib/profile-server';
import { applyBadgePrefs, DEFAULT_BANNER_NAME_SIZE, DEFAULT_PROFILE_STYLE } from '@/lib/profile';
import { readProfileExtras } from '@/lib/profile-style';
import { characterBrowseImpliesNsfw } from '@/lib/nsfw-notice';
import { adultCardsEnabled } from '@/lib/nsfw-account';
import { AppHeader } from '@/components/layout/app-header';
import { PublicProfile } from '@/components/profile/public-profile';
import { withVisualColumnRetry } from '@/lib/ensure-visual-columns';

export const dynamic = 'force-dynamic';

function tagList(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
  if (typeof tags !== 'string' || !tags.trim()) return [];
  return tags.split(',').map((tag) => tag.trim()).filter(Boolean);
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  try {
    const { username } = await params;
    const user = await findUserByUsername(decodeURIComponent(username)).catch(() => null);
    return { title: user ? `${user.displayName || user.username} (@${user.username}) · NexusAI` : 'Profile not found · NexusAI' };
  } catch {
    return { title: 'Profile · NexusAI' };
  }
}

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  let user;
  try {
    user = await findUserByUsername(decodeURIComponent(username));
  } catch (err) {
    console.error('[profile] findUserByUsername failed:', err instanceof Error ? err.message : err);
    notFound();
  }
  if (!user) notFound();

  let viewer = null;
  try {
    viewer = await getViewer();
  } catch (err) {
    console.warn('[profile] getViewer failed:', err instanceof Error ? err.message : err);
  }

  const seeAll = !!viewer && (viewer.isCreatorAdmin || viewer.user.id === user.id);
  const ownerView = !!viewer && (viewer.user.id === user.id || viewer.isAdmin || viewer.isCreatorAdmin);
  const showNsfw = await adultCardsEnabled(viewer).catch(() => false);
  const includeNsfw = showNsfw;

  const extras = await readProfileExtras(user.id).catch(() => null);
  const safeExtras = extras ?? {
    profileSongUrl: '',
    profileStyle: { ...DEFAULT_PROFILE_STYLE },
    badgePrefs: { order: [] as string[], hidden: [] as string[] },
    bannerNameSize: DEFAULT_BANNER_NAME_SIZE,
    bannerNameColor: '',
    bannerNameGlow: false,
    profileBgType: 'image' as const,
    profileBgUrl: '',
    profileBgVideoUrl: '',
    profileCardOpacity: 35,
    bannerMediaType: 'image' as const,
    bannerVideoUrl: '',
  };

  const stats = await profileStats(user.id, { publicOnly: !seeAll }).catch(() => ({
    characters: 0,
    loreEntries: 0,
    lorebooks: 0,
    personas: 0,
    chats: 0,
  }));

  const rows = await withVisualColumnRetry(
    () => prisma.character.findMany({
      // Visitors only see published cards. The author and the creator admin also see drafts, unlisted, and moderated cards.
      where: {
        ownerId: user.id,
        ...(seeAll ? {} : { visibility: 'PUBLIC' as const, moderated: false }),
        ...(includeNsfw ? {} : { nsfw: false }),
      },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { sessions: true } } },
    }),
    [],
    `profile/${user.username}`,
  );

  const creations = rows.flatMap((c) => {
    try {
      const flagged = c.nsfw === true || characterBrowseImpliesNsfw(c);
      if (!includeNsfw && flagged) return [];
      return [{
        id: c.id,
        name: c.name,
        title: c.title ?? '',
        summary: c.summary ?? '',
        creator: c.creator ?? 'Anonymous',
        tags: tagList(c.tags),
        avatar: c.avatar,
        banner: c.banner,
        updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : String(c.updatedAt ?? ''),
        nsfw: flagged,
        chatCount: c._count?.sessions ?? 0,
        ownerId: c.ownerId,
        visibility: c.visibility,
        moderated: c.moderated === true,
        hiddenFromPublic: flagged && ownerView && showNsfw,
        audioUrl: viewer && canEditCharacter(viewer, c) ? (c.audioUrl ?? '') : '',
      }];
    } catch (err) {
      console.warn('[profile] skipped character row', c?.id, err instanceof Error ? err.message : err);
      return [];
    }
  });

  const pinned = pinIds(user.pinnedCharacterIds)
    .map((id) => creations.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);

  let badges = [];
  try {
    badges = applyBadgePrefs(profileBadges(user, stats), safeExtras.badgePrefs);
  } catch (err) {
    console.warn('[profile] badges unavailable:', err instanceof Error ? err.message : err);
    badges = [];
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-none p-4 pb-16 sm:p-6 lg:p-8">
        <PublicProfile
          key={user.username}
          profile={{
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            image: user.image,
            bio: user.bio ?? '',
            banner: user.banner,
            bannerAnimated: user.bannerAnimated !== false,
            bannerPositionY: user.bannerPositionY || 15,
            accentTheme: user.accentTheme || 'OBSIDIAN',
            badges,
            stats,
            profileSongUrl: safeExtras.profileSongUrl,
            profileStyle: safeExtras.profileStyle as any,
            bannerNameSize: safeExtras.bannerNameSize,
            bannerNameColor: safeExtras.bannerNameColor,
            bannerNameGlow: safeExtras.bannerNameGlow,
            profileBgType: safeExtras.profileBgType,
            profileBgUrl: safeExtras.profileBgUrl,
            profileBgVideoUrl: safeExtras.profileBgVideoUrl,
            profileCardOpacity: safeExtras.profileCardOpacity,
            bannerMediaType: safeExtras.bannerMediaType,
            bannerVideoUrl: safeExtras.bannerVideoUrl,
          }}
          pinned={pinned}
          creations={creations}
        />
      </main>
    </div>
  );
}
