import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getViewer, canEditCharacter } from '@/lib/access';
import { canViewCharacter } from '@/lib/card-visibility';
import { characterImpliesNsfw } from '@/lib/nsfw-notice';
import { adultCardsEnabled } from '@/lib/nsfw-account';
import { AppHeader } from '@/components/layout/app-header';
import { RichContent } from '@/components/editor/rich-content';
import { CommentThread } from '@/components/comments/comment-thread';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const character = await prisma.character.findUnique({ where: { id }, select: { name: true } });
  return { title: character ? `${character.name} · NexusAI` : 'Card · NexusAI' };
}

export default async function CharacterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const character = await prisma.character.findUnique({ where: { id } });
  const viewer = await getViewer();
  if (!character || !canViewCharacter(viewer ? { isCreatorAdmin: viewer.isCreatorAdmin, userId: viewer.user.id } : null, character)) notFound();
  if ((character.nsfw || characterImpliesNsfw(character)) && !(await adultCardsEnabled(viewer))) notFound();
  const canEdit = !!viewer && canEditCharacter(viewer, character);
  const tags = character.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  const cover = character.banner || character.avatar;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-16">
        <article className="overflow-hidden rounded-2xl bg-card ring-1 ring-white/10">
          <div className="relative aspect-[16/7] bg-secondary">
            {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : null}
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
