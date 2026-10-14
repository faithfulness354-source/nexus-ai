import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getViewer, canEditCharacter } from '@/lib/access';
import { findUserByUsername, profileStats, profileBadges, pinIds } from '@/lib/profile-server';
import { applyBadgePrefs } from '@/lib/profile';
import { readProfileExtras } from '@/lib/profile-style';
import { characterImpliesNsfw } from '@/lib/nsfw-notice';
import { adultCardsEnabled } from '@/lib/nsfw-account';
import { AppHeader } from '@/components/layout/app-header';
import { PublicProfile } from '@/components/profile/public-profile';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await findUserByUsername(decodeURIComponent(username));
  return { title: user ? `${user.displayName || user.username} (@${user.username}) · NexusAI` : 'Profile not found · NexusAI' };
}

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await findUserByUsername(decodeURIComponent(username));
  if (!user) notFound();

  const viewer = await getViewer();
  const seeAll = !!viewer && (viewer.isCreatorAdmin || viewer.user.id === user.id);
  const ownerView = !!viewer && (viewer.user.id === user.id || viewer.isAdmin || viewer.isCreatorAdmin);
  const showNsfw = await adultCardsEnabled(viewer);
  const includeNsfw = showNsfw;
  const extras = await readProfileExtras(user.id);
  const stats = await profileStats(user.id, { publicOnly: !seeAll });
  const rows = await prisma.character.findMany({
    // Visitors only see published cards. The author and the creator admin also see drafts, unlisted, and moderated cards.
    where: {
      ownerId: user.id,
      ...(seeAll ? {} : { visibility: 'PUBLIC' as const, moderated: false }),
      ...(seeAll || includeNsfw ? {} : { nsfw: false }),
    },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { sessions: true } } },
  });
  const creations = rows.flatMap((c) => {
    const flagged = c.nsfw || characterImpliesNsfw(c);
    if (!seeAll && !includeNsfw && flagged) return [];
    return [{
      id: c.id, name: c.name, title: c.title, summary: c.summary, creator: c.creator, tags: c.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      avatar: c.avatar, banner: c.banner, updatedAt: c.updatedAt.toISOString(), nsfw: flagged, chatCount: c._count.sessions, ownerId: c.ownerId,
      visibility: c.visibility, moderated: c.moderated,
      hiddenFromPublic: flagged && ownerView && showNsfw,
      audioUrl: viewer && canEditCharacter(viewer, c) ? c.audioUrl : '',
    }];
  });
  const pinned = pinIds(user.pinnedCharacterIds).map((id) => creations.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-none p-4 pb-16 sm:p-6 lg:p-8">
        <PublicProfile
          key={user.username}
          profile={{
            username: user.username, displayName: user.displayName, image: user.image, bio: user.bio,
            banner: user.banner, bannerAnimated: user.bannerAnimated, bannerPositionY: user.bannerPositionY || 15, accentTheme: user.accentTheme,
            badges: applyBadgePrefs(profileBadges(user, stats), extras.badgePrefs), stats,
            profileSongUrl: extras.profileSongUrl, profileStyle: extras.profileStyle,
            bannerNameSize: extras.bannerNameSize, bannerNameColor: extras.bannerNameColor, bannerNameGlow: extras.bannerNameGlow,
            profileBgType: extras.profileBgType, profileBgUrl: extras.profileBgUrl, profileBgVideoUrl: extras.profileBgVideoUrl,
            profileCardOpacity: extras.profileCardOpacity,
            bannerMediaType: extras.bannerMediaType, bannerVideoUrl: extras.bannerVideoUrl,
          }}
          pinned={pinned}
          creations={creations}
        />
      </main>
    </div>
  );
}
