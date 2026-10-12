export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, json } from '@/lib/access';
import { canViewCharacter } from '@/lib/card-visibility';

/** Character ids the viewer has bookmarked (empty for guests). */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return json([]);
  const rows = await prisma.bookmark.findMany({ where: { userId: viewer.user.id }, select: { characterId: true } });
  return json(rows.map((r) => r.characterId));
}

/** Toggles a bookmark: { characterId } → { bookmarked } */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const characterId = typeof body?.characterId === 'string' ? body.characterId : '';
  const character = characterId ? await prisma.character.findUnique({ where: { id: characterId }, select: { id: true, visibility: true, moderated: true, ownerId: true } }) : null;
  if (!character || !canViewCharacter({ isCreatorAdmin: viewer.isCreatorAdmin, userId: viewer.user.id }, character)) {
    return json({ error: 'Character not found' }, 404);
  }
  const key = { userId_characterId: { userId: viewer.user.id, characterId } };
  const existing = await prisma.bookmark.findUnique({ where: key });
  if (existing) {
    await prisma.bookmark.delete({ where: key });
    return json({ bookmarked: false });
  }
  await prisma.bookmark.create({ data: { userId: viewer.user.id, characterId } });
  return json({ bookmarked: true });
}
