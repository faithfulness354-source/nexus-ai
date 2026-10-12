export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exportAsChubV2 } from '@/lib/card-parser';
import { getViewer, canViewNsfw, nsfwLocked } from '@/lib/access';
import { canViewCharacter } from '@/lib/card-visibility';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const character = await prisma.character.findUnique({ where: { id } });
    const viewer = await getViewer();
    if (!character || !canViewCharacter(viewer ? { isCreatorAdmin: viewer.isCreatorAdmin, userId: viewer.user.id } : null, character)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (character.nsfw && !canViewNsfw(viewer)) return nsfwLocked();
    const v2 = exportAsChubV2(character as any);
    return NextResponse.json({ data: v2 });
  } catch (err: any) {
    console.error('Export error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}
