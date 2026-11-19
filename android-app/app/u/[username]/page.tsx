import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getViewer, canEditCharacter } from '@/lib/access';
import { resolvePublicProfile, profileStats, profileBadges, pinIds, type ProfileUser } from '@/lib/profile-server';
import {
  applyBadgePrefs,
  DEFAULT_BANNER_NAME_SIZE,
  DEFAULT_PROFILE_STYLE,
  type BadgePrefs,
  type ProfileBadge,
} from '@/lib/profile';
import { readProfileExtras } from '@/lib/profile-style';
import { characterBrowseImpliesNsfw } from '@/lib/nsfw-notice';
import { adultCardsEnabled } from '@/lib/nsfw-account';
import { AppHeader } from '@/components/layout/app-header';
import { PublicProfile } from '@/components/profile/public-profile';
import { ensureVisualColumns } from '@/lib/ensure-visual-columns';

export const dynamic = 'force-dynamic';

function tagList(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
  if (typeof tags !== 'string' || !tags.trim()) return [];
  return tags.split(',').map((tag) => tag.trim()).filter(Boolean);
}

function SoftProfileError({ username, detail }: { username: string; detail?: string }) {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="font-display text-2xl font-bold">Profile temporarily unavailable</h1>
        <p className="text-sm text-muted-foreground">
          We could not finish loading <span className="text-foreground">@{username}</span>.
          The account is still there — try again in a moment.
        </p>
        {detail ? (
          <p className="max-w-md break-words rounded-lg bg-secondary/60 px-3 py-2 font-mono text-[11px] text-muted-foreground">
            {detail.slice(0, 280)}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Link href="/" className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">
            Back to Discover
          </Link>
          <Link href={`/u/${encodeURIComponent(username)}`} className="inline-flex h-10 items-center rounded-full bg-secondary px-4 text-sm font-semibold">
            Retry
          </Link>
        </div>
      </main>
    </div>
  );
}

async function loadCharactersForProfile(opts: {
  userId: string;
  username: string | null;
  seeAll: boolean;
  includeNsfw: boolean;
}) {
  await ensureVisualColumns().catch((err) => {
    console.warn('[profile] ensureVisualColumns:', err instanceof Error ? err.message : err);
  });

  const where = {
    ownerId: opts.userId,
    ...(opts.seeAll ? {} : { visibility: 'PUBLIC' as const, moderated: false }),
    ...(opts.includeNsfw ? {} : { nsfw: false }),
  };

  try {
    return await prisma.character.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { sessions: true } } },
    });
  } catch (err) {
    console.error(
      `[profile/${opts.username}] character findMany with _count failed:`,
      err instanceof Error ? err.message : err,
    );
  }

  // Fallback without relation count (sessions table / count can fail independently).
  try {
    const rows = await prisma.character.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => ({ ...row, _count: { sessions: 0 } }));
  } catch (err) {
    console.error(
      `[profile/${opts.username}] character findMany fallback failed:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  try {
    const { username } = await params;
    const user = await resolvePublicProfile(username).catch(() => null);
    const handle = user?.username || username;
    return {
      title: user
        ? `${user.displayName || handle} (@${handle}) · NexusAI`
        : 'Profile not found · NexusAI',
    };
  } catch {
    return { title: 'Profile · NexusAI' };
  }
}

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username: rawUsername } = await params;
  const requested = decodeURIComponent(rawUsername || '').trim().replace(/^@+/, '') || 'unknown';

  let user: ProfileUser | null = null;
  try {
    user = await resolvePublicProfile(requested);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[profile] resolvePublicProfile threw:', detail);
    return <SoftProfileError username={requested} detail={detail} />;
  }
  if (!user?.id) notFound();

  const handle = (user.username || requested).toLowerCase();

  try {
    let viewer = null;
    try {
      viewer = await getViewer();
    } catch (err) {
      console.warn('[profile] getViewer failed:', err instanceof Error ? err.message : err);
    }

    const seeAll = !!viewer && (viewer.isCreatorAdmin || viewer.user.id === user.id);
    const ownerView = !!viewer && (viewer.user.id === user.id || viewer.isAdmin || viewer.isCreatorAdmin);
    const showNsfw = await adultCardsEnabled(viewer).catch((err) => {
      console.warn('[profile] adultCardsEnabled failed:', err instanceof Error ? err.message : err);
      return false;
    });

    const emptyBadgePrefs: BadgePrefs = { order: [], hidden: [] };
    const extras = await readProfileExtras(user.id).catch((err) => {
      console.warn('[profile] readProfileExtras failed:', err instanceof Error ? err.message : err);
      return null;
    });
    const safeExtras = extras ?? {
      profileSongUrl: '',
      profileStyle: { ...DEFAULT_PROFILE_STYLE },
      badgePrefs: emptyBadgePrefs,
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

    const rows = await loadCharactersForProfile({
      userId: user.id,
      username: handle,
      seeAll,
      includeNsfw: showNsfw,
    });

    const creations = rows.flatMap((c) => {
      try {
        const flagged = c.nsfw === true || characterBrowseImpliesNsfw(c);
        if (!showNsfw && flagged) return [];
        return [{
          id: c.id,
          name: c.name,
          title: c.title ?? '',
          summary: typeof c.summary === 'string' ? c.summary : '',
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

    let badges: ProfileBadge[] = [];
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
            key={handle}
            profile={{
              id: user.id,
              username: handle,
              displayName: user.displayName,
              image: user.image,
              bio: typeof user.bio === 'string' ? user.bio : '',
              banner: user.banner,
              bannerAnimated: user.bannerAnimated !== false,
              bannerPositionY: user.bannerPositionY || 15,
              accentTheme: user.accentTheme || 'OBSIDIAN',
              badges,
              stats: {
                characters: stats.characters ?? 0,
                loreEntries: stats.loreEntries ?? 0,
                chats: stats.chats ?? 0,
              },
              profileSongUrl: safeExtras.profileSongUrl,
              profileStyle: safeExtras.profileStyle,
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
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[profile] /u/${handle} render failed:`, detail);
    return <SoftProfileError username={handle} detail={detail} />;
  }
}
