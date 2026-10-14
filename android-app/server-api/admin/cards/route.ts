export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCreatorAdmin } from '@/lib/access';
import { parseVisibility } from '@/lib/card-visibility';

const cardSelect = {
  id: true,
  name: true,
  creator: true,
  visibility: true,
  moderated: true,
  nsfw: true,
  updatedAt: true,
  ownerId: true,
  owner: { select: { username: true, displayName: true } },
} as const;

/** Every card on the platform, including private drafts. Creator admin only. */
export async function GET() {
  const viewer = await requireCreatorAdmin();
  if (viewer instanceof Response) return viewer;
  try {
    const cards = await prisma.character.findMany({
      orderBy: { updatedAt: 'desc' },
      select: cardSelect,
    });
    return NextResponse.json(cards);
  } catch (err) {
    console.error('GET /api/admin/cards error:', err);
    return NextResponse.json({ error: 'Failed to load cards.' }, { status: 500 });
  }
}

/** Change visibility or the moderated takedown flag. */
export async function PATCH(request: NextRequest) {
  const viewer = await requireCreatorAdmin();
  if (viewer instanceof Response) return viewer;
  try {
    const body = await request.json().catch(() => null);
    const id = String(body?.id ?? '').trim();
    if (!id) return NextResponse.json({ error: 'Card id required.' }, { status: 400 });
    const data: { visibility?: 'PRIVATE' | 'PUBLIC' | 'UNLISTED'; moderated?: boolean } = {};
    if (body?.visibility !== undefined) {
      const visibility = parseVisibility(body.visibility);
      if (!visibility) return NextResponse.json({ error: 'Visibility must be Private, Public, or Unlisted.' }, { status: 400 });
      data.visibility = visibility;
    }
    if (typeof body?.moderated === 'boolean') data.moderated = body.moderated;
    if (!('visibility' in data) && !('moderated' in data)) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }
    const card = await prisma.character.update({ where: { id }, data, select: cardSelect });
    return NextResponse.json(card);
  } catch (err) {
    console.error('PATCH /api/admin/cards error:', err);
    return NextResponse.json({ error: 'Failed to update the card.' }, { status: 500 });
  }
}
