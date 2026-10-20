export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getDefaultSessionTarget } from '@/lib/llm/resolve';
import { getViewer, unauthorized, nsfwLocked } from '@/lib/access';
import { adultCardsEnabled } from '@/lib/nsfw-account';
import { canViewCharacter } from '@/lib/card-visibility';
import { characterImpliesNsfw } from '@/lib/nsfw-notice';
import { ensureGreeting } from '@/lib/greeting';
import { syncChatToCloud } from '@/lib/supabase/sync';

export async function GET(request: NextRequest) {
  try {
    const viewer = await getViewer();
    if (!viewer) return unauthorized();
    const url = new URL(request.url);
    const characterId = url.searchParams.get('characterId');
    const nsfw = url.searchParams.get('nsfw');
    const showNsfw = await adultCardsEnabled(viewer);
    // Own chats; admins also see legacy chats created before accounts existed.
    const where: any = viewer.isAdmin ? { OR: [{ userId: viewer.user.id }, { userId: null }] } : { userId: viewer.user.id };
    if (characterId) where.characterId = characterId;
    if (nsfw === 'true' && showNsfw) {
      where.character = { is: { nsfw: true } };
    } else if (!showNsfw || nsfw === 'false') {
      where.character = { is: { nsfw: false } };
    }

    const sessions = await prisma.chatSession.findMany({
      where,
      include: { character: { select: { name: true, avatar: true, nsfw: true } }, _count: { select: { messages: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json(sessions);
  } catch (err: any) {
    console.error('GET /api/sessions error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const viewer = await getViewer();
    if (!viewer) return unauthorized();
    const body = await request.json();
    const characterId = body?.characterId;
    if (!characterId) return NextResponse.json({ error: 'characterId required' }, { status: 400 });

    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (!character || !canViewCharacter({ isCreatorAdmin: viewer.isCreatorAdmin, userId: viewer.user.id }, character)) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }
    if ((character.nsfw || characterImpliesNsfw(character)) && !(await adultCardsEnabled(viewer))) return nsfwLocked();

    // New sessions always start on Google Gemini (the primary provider)
    const target = await getDefaultSessionTarget();

    let personaId: string | null = null;
    if (typeof body?.personaId === 'string' && body.personaId) {
      const owned = await prisma.persona.findFirst({ where: { id: body.personaId, userId: viewer.user.id }, select: { id: true } });
      if (!owned) return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
      personaId = owned.id;
    }

    const session = await prisma.chatSession.create({
      data: {
        characterId,
        userId: viewer.user.id,
        personaId,
        title: `Chat with ${character?.name ?? 'Character'}`,
        model: target.model,
        provider: target.provider,
      },
    });

    // Create generation settings
    await prisma.generationSettings.create({
      data: { sessionId: session.id, forbiddenWords: '[]' },
    });

    const greeting = await ensureGreeting(session.id, undefined, personaId);
    void syncChatToCloud(session, viewer.user);

    return NextResponse.json({ ...session, messages: greeting ? [greeting] : [] }, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/sessions error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}
