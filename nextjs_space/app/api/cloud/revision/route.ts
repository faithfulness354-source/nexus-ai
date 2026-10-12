export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getViewer } from '@/lib/access';

/** A short stamp the browser and the phone poll so both see the same account's latest save. */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ revision: 'signed-out' });
  const [characters, chats, message, personas] = await Promise.all([
    prisma.character.aggregate({ where: { ownerId: viewer.user.id }, _max: { updatedAt: true } }),
    prisma.chatSession.aggregate({ where: { userId: viewer.user.id }, _max: { updatedAt: true } }),
    prisma.message.findFirst({
      where: { session: { userId: viewer.user.id } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.persona.aggregate({ where: { userId: viewer.user.id }, _max: { updatedAt: true } }),
  ]);
  const revision = [
    characters._max.updatedAt?.toISOString() ?? '',
    chats._max.updatedAt?.toISOString() ?? '',
    message?.createdAt?.toISOString() ?? '',
    personas._max.updatedAt?.toISOString() ?? '',
  ].join('|');
  return NextResponse.json({ revision }, { headers: { 'Cache-Control': 'no-store' } });
}
