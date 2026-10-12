export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, can, canViewNsfw, nsfwLocked, canEditCharacter } from '@/lib/access';
import { normalizeAudioUrl } from '@/lib/audio-url';
import { parseVisibility } from '@/lib/card-visibility';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get('search') ?? '';
    const tag = url.searchParams.get('tag') ?? '';
    const nsfw = url.searchParams.get('nsfw');
    const mine = url.searchParams.get('mine') === 'true';

    const where: any = {};
    const viewer = await getViewer();
    if (mine) {
      if (!viewer) return unauthorized();
      where.ownerId = viewer.user.id;
    } else {
      where.visibility = 'PUBLIC';
      where.moderated = false;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
        { scenario: { contains: search, mode: 'insensitive' } },
        { creator: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (tag) {
    where.tags = { contains: tag, mode: 'insensitive' };

    }
    // Safe by default: NSFW characters are only listed when explicitly requested by an entitled viewer.
    if (nsfw !== 'true' || !canViewNsfw(viewer)) {
      where.nsfw = false;
    }

    const characters = await prisma.character.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { sessions: true } } },
    });

    return NextResponse.json(
      characters.map(({ _count, ...c }) => {
        const card = { ...c, chatCount: _count?.sessions ?? 0 };
        if (!viewer || !canEditCharacter(viewer, c)) card.audioUrl = '';
        return card;
      })
    );
  } catch (err: any) {
    console.error('GET /api/characters error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to fetch characters' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const viewer = await getViewer();
    if (!viewer) return unauthorized();
    const body = await request.json();
    if (body?.nsfw === true && !canViewNsfw(viewer)) return nsfwLocked();
    const character = await prisma.character.create({
      data: {
        ownerId: viewer.user.id,
        name: body?.name ?? 'Unnamed',
        title: String(body?.title ?? '').trim(),
        gallery: Array.isArray(body?.gallery) ? body.gallery : [],
        sceneImages: body?.sceneImages ?? true,
        summary: body?.summary ?? '',
        personality: body?.personality ?? '',
        scenario: body?.scenario ?? '',
        initialMessage: String(body?.firstMessage ?? body?.initialMessage ?? body?.first_mes ?? ''),
        exampleDialogue: body?.exampleDialogue ?? '',
        customRules: body?.customRules ?? '{"meters":[],"rules":[]}',
        // Custom system prompts are a Plus+ feature.
        systemPrompt: can(viewer, 'customPrompts') ? body?.systemPrompt ?? '' : '',
        creatorNotes: body?.creatorNotes ?? '',
        tags: Array.isArray(body?.tags) ? body.tags.join(', ') : String(body?.tags ?? ''),
        avatar: body?.avatar || null,
        banner: body?.banner || null,
        audioUrl: normalizeAudioUrl(body?.audioUrl),
        creator: (body?.creator ?? '').trim() || 'Anonymous',
        nsfw: body?.nsfw === true,
        visibility: parseVisibility(body?.visibility) ?? 'PRIVATE',
        moderated: false,
      },
    });
    return NextResponse.json({ ...character, firstMessage: character.initialMessage ?? '' }, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/characters error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to create character' }, { status: 500 });
  }
}
