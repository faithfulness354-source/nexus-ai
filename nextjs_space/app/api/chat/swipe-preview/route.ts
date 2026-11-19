export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, forbidden, canAccessSession } from '@/lib/access';
import { textSwipePreview } from '@/lib/generation-limits';
import { MAX_TEXT_SWIPES, textSwipeCreditCost } from '@/lib/reroll-costs';

/** Preview the next text regeneration credit cost for an assistant message's turn. */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  const assistantMessageId = request.nextUrl.searchParams.get('assistantMessageId')?.trim() || '';
  if (!assistantMessageId) return NextResponse.json({ error: 'assistantMessageId required' }, { status: 400 });

  const assistant = await prisma.message.findUnique({
    where: { id: assistantMessageId },
    include: { session: { select: { userId: true } } },
  });
  if (!assistant || assistant.role !== 'ASSISTANT') {
    return NextResponse.json({ error: 'Assistant message not found' }, { status: 404 });
  }
  if (!canAccessSession(viewer, assistant.session)) return forbidden('This chat belongs to another account.');

  const priorUser = await prisma.message.findFirst({
    where: { sessionId: assistant.sessionId, role: 'USER', deleted: false, index: { lt: assistant.index } },
    orderBy: { index: 'desc' },
    select: { id: true },
  });
  if (!priorUser) {
    return NextResponse.json({ swipeCount: 0, cost: 1, allowed: true, maxSwipes: MAX_TEXT_SWIPES, label: 'Regenerate (1 Credit)' });
  }

  const preview = await textSwipePreview(priorUser.id);
  const label = !preview.allowed
    ? 'Reroll limit reached'
    : `Regenerate (${preview.cost} Credit${preview.cost === 1 ? '' : 's'})`;
  return NextResponse.json({ ...preview, maxSwipes: MAX_TEXT_SWIPES, turnId: priorUser.id, label, nextCost: textSwipeCreditCost(preview.swipeCount) });
}
