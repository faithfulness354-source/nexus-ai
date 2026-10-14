import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { canViewNsfw, canEditCharacter } from '@/lib/access';
import { findUserByUsername, profileStats, profileBadges, pinIds } from '@/lib/profile-server';
import { characterImpliesNsfw } from '@/lib/nsfw-notice';
import { usernameStaticParams } from '@/lib/android-static-params';
import { AppHeader } from '@/components/layout/app-header';
import { PublicProfile } from '@/components/profile/public-profile';

export function generateStaticParams() {
  return usernameStaticParams();
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await findUserByUsername(decodeURIComponent(username));
  return { title: user ? `${user.displayName || user.username} (@${user.username}) · NexusAI` : 'Profile not found · NexusAI' };
}

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await findUserByUsername(decodeURIComponent(username));
  if (!user) notFound();

  const viewer = null;
  const seeAll = false;
  const stats = await profileStats(user.id, { publicOnly: !seeAll });
  const rows = await prisma.character.findMany({
    // Visitors only see published cards. The author and the creator admin also see drafts, unlisted, and moderated cards.
    where: {
      ownerId: user.id,
      ...(seeAll ? {} : { visibility: 'PUBLIC' as const, moderated: false }),
      ...(canViewNsfw(viewer) ? {} : { nsfw: false }),
    },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { sessions: true } } },
  });
  const creations = rows.flatMap((c) => {
    const flagged = c.nsfw || characterImpliesNsfw(c);
    if (!canViewNsfw(viewer) && flagged) return [];
    return [{
      id: c.id, name: c.name, title: c.title, summary: c.summary, creator: c.creator, tags: c.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      avatar: c.avatar, banner: c.banner, nsfw: flagged, chatCount: c._count.sessions, ownerId: c.ownerId,
      visibility: c.visibility, moderated: c.moderated,
      audioUrl: viewer && canEditCharacter(viewer, c) ? c.audioUrl : '',
    }];
  });
  const pinned = pinIds(user.pinnedCharacterIds).map((id) => creations.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-2 sm:px-4 pt-4 pb-16">
        <PublicProfile
          key={user.username}
          profile={{
            username: user.username, displayName: user.displayName, image: user.image, bio: user.bio,
            banner: user.banner, bannerAnimated: user.bannerAnimated, bannerPositionY: user.bannerPositionY || 15, accentTheme: user.accentTheme,
            badges: profileBadges(user, stats), stats,
          }}
          pinned={pinned}
          creations={creations}
        />
      </main>
    </div>
  );
}
