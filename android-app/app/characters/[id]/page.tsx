import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getViewer, canEditCharacter } from '@/lib/access';
import { canViewCharacter } from '@/lib/card-visibility';
import { characterBrowseImpliesNsfw } from '@/lib/nsfw-notice';
import { adultCardsEnabled } from '@/lib/nsfw-account';
import { AppHeader } from '@/components/layout/app-header';
import { RichContent } from '@/components/editor/rich-content';
import { CommentThread } from '@/components/comments/comment-thread';
import { withVisualColumnRetry } from '@/lib/ensure-visual-columns';
import { CardCoverImage } from '@/components/gallery/card-cover-image';
import { mediaVersionUrl } from '@/lib/media-src';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const character = await withVisualColumnRetry(
    () => prisma.character.findUnique({ where: { id }, select: { name: true } }),
    null,
    'character metadata',
  );
  return { title: character ? `${character.name} · NexusAI` : 'Card · NexusAI' };
}

export default async function CharacterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const character = await withVisualColumnRetry(
    () => prisma.character.findUnique({ where: { id } }),
    null,
    'character detail',
  );
  const viewer = await getViewer().catch(() => null);
  if (!character || !canViewCharacter(viewer ? { isCreatorAdmin: viewer.isCreatorAdmin, userId: viewer.user.id } : null, character)) notFound();
  if ((character.nsfw || characterBrowseImpliesNsfw(character)) && !(await adultCardsEnabled(viewer).catch(() => false))) notFound();
  const canEdit = !!viewer && canEditCharacter(viewer, character);
  const tags = String(character.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean);
  const rawCover = String(character.banner || character.avatar || '').trim();
  const cover = rawCover
    ? mediaVersionUrl(rawCover, character.updatedAt?.toISOString?.() ?? character.updatedAt)
    : '';

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-16">
        <article className="overflow-hidden rounded-2xl bg-card ring-1 ring-white/10">
          <div className="relative mx-auto aspect-square w-full max-w-xl bg-secondary">
            {cover ? (
              <CardCoverImage
                src={cover}
                alt={`${character.name} cover`}
                className="absolute inset-0 h-full w-full"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-violet-900/60 via-slate-900 to-fuchsia-900/40" />
            )}
          </div>
          <div className="space-y-3 p-5">
            <h1 className="font-display text-3xl font-bold">{character.name}</h1>
            {character.title?.trim() && <p className="text-sm italic text-muted-foreground">{character.title}</p>}
            <p className="text-sm text-muted-foreground">@{character.creator || 'Anonymous'}</p>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-xs">#{tag}</span>)}
              </div>
            )}
            {character.summary?.trim() && <RichContent content={character.summary} />}
            <div className="flex flex-wrap gap-2 pt-2">
              <Link href={`/characters/${character.id}/chat`} className="inline-flex h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">Chat</Link>
              {canEdit && <Link href={`/characters/${character.id}/edit`} className="inline-flex h-11 items-center rounded-full bg-secondary px-4 text-sm font-semibold">Edit</Link>}
            </div>
          </div>
        </article>
        <CommentThread type="card" targetId={character.id} title="Comments" />
      </main>
    </div>
  );
}
