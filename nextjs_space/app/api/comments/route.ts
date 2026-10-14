export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, json, forbidden } from '@/lib/access';
import { canViewCharacter } from '@/lib/card-visibility';
import { characterImpliesNsfw } from '@/lib/nsfw-notice';
import { adultCardsEnabled } from '@/lib/nsfw-account';
import { addCardComment, addProfileComment, cleanComment, deleteCardComment, deleteProfileComment, listCardComments, listProfileComments, type CommentKind } from '@/lib/comments';

function kindOf(value: unknown): CommentKind | null {
  return value === 'card' || value === 'profile' ? value : null;
}

async function visibleCard(id: string) {
  const character = await prisma.character.findUnique({ where: { id }, select: { id: true, ownerId: true, visibility: true, moderated: true, nsfw: true, name: true, title: true, summary: true, personality: true, scenario: true, initialMessage: true, tags: true } });
  if (!character) return null;
  const viewer = await getViewer();
  const allowed = canViewCharacter(viewer ? { isCreatorAdmin: viewer.isCreatorAdmin, userId: viewer.user.id } : null, character);
  if (!allowed) return null;
  if ((character.nsfw || characterImpliesNsfw(character)) && !(await adultCardsEnabled(viewer))) return null;
  return { character, viewer };
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const kind = kindOf(url.searchParams.get('type'));
    const targetId = String(url.searchParams.get('target') ?? '').trim();
    if (!kind || !targetId) return json({ error: 'Missing comment target' }, 400);
    const viewer = await getViewer();
    if (kind === 'card') {
      const visible = await visibleCard(targetId);
      if (!visible) return json({ error: 'Not found' }, 404);
      const comments = await listCardComments(targetId, visible.viewer, visible.character.ownerId);
      return json({ comments, signedIn: !!visible.viewer });
    }
    const profile = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!profile) return json({ error: 'Not found' }, 404);
    const comments = await listProfileComments(targetId, viewer);
    return json({ comments, signedIn: !!viewer });
  } catch (err) {
    console.error('GET /api/comments error:', err instanceof Error ? err.message : 'unknown');
    return json({ error: 'Could not load comments' }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const viewer = await getViewer();
    if (!viewer) return unauthorized();
    const body = await request.json().catch(() => ({}));
    const kind = kindOf(body?.type);
    const targetId = String(body?.targetId ?? '').trim();
    const content = cleanComment(body?.content);
    if (!kind || !targetId) return json({ error: 'Missing comment target' }, 400);
    if (!content) return json({ error: 'Write a comment first.' }, 400);
    if (kind === 'card') {
      const visible = await visibleCard(targetId);
      if (!visible) return json({ error: 'Not found' }, 404);
      await addCardComment(targetId, viewer, content);
      return json({ comments: await listCardComments(targetId, viewer, visible.character.ownerId), signedIn: true });
    }
    const profile = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!profile) return json({ error: 'Not found' }, 404);
    await addProfileComment(targetId, viewer, content);
    return json({ comments: await listProfileComments(targetId, viewer), signedIn: true });
  } catch (err) {
    console.error('POST /api/comments error:', err instanceof Error ? err.message : 'unknown');
    return json({ error: 'Could not post that comment' }, 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const viewer = await getViewer();
    if (!viewer) return unauthorized();
    const body = await request.json().catch(() => ({}));
    const kind = kindOf(body?.type);
    const targetId = String(body?.targetId ?? '').trim();
    const commentId = String(body?.id ?? '').trim();
    if (!kind || !targetId || !commentId) return json({ error: 'Missing comment' }, 400);
    if (kind === 'card') {
      const visible = await visibleCard(targetId);
      if (!visible) return json({ error: 'Not found' }, 404);
      const removed = await deleteCardComment(commentId, viewer, visible.character.ownerId);
      if (!removed) return forbidden('You can only delete your own comment.');
      return json({ comments: await listCardComments(targetId, viewer, visible.character.ownerId), signedIn: true });
    }
    const removed = await deleteProfileComment(commentId, viewer, targetId);
    if (!removed) return forbidden('You can only delete your own comment.');
    return json({ comments: await listProfileComments(targetId, viewer), signedIn: true });
  } catch (err) {
    console.error('DELETE /api/comments error:', err instanceof Error ? err.message : 'unknown');
    return json({ error: 'Could not delete that comment' }, 500);
  }
}
