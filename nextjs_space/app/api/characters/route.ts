export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, can, canViewNsfw, nsfwLocked, canEditCharacter } from '@/lib/access';
import { normalizeAudioUrl } from '@/lib/audio-url';
import { parseVisibility } from '@/lib/card-visibility';
import { syncCharacterToCloud } from '@/lib/supabase/sync';
import { pullCloudLibrary } from '@/lib/supabase/apply';
import { characterImpliesNsfw } from '@/lib/nsfw-notice';
import { ensureDefaultCards } from '@/lib/ensure-default-cards';
import { adultCardsEnabled } from '@/lib/nsfw-account';

function plainExcerpt(value: string, limit = 280) {
  const text = value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit).trim()}…` : text;
}

function tagList(tags: string) {
  return tags.split(',').map((tag) => tag.trim()).filter(Boolean);
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get('search') ?? '';
    const tag = url.searchParams.get('tag') ?? '';
    const mine = url.searchParams.get('mine') === 'true';
    const viewer = await getViewer();
    // Browse, search, and My Characters include adult cards only for a paid account that turned the profile setting on.
    const showNsfw = await adultCardsEnabled(viewer);
    const where: any = {};
    if (mine) {
      if (!viewer) return unauthorized();
      await pullCloudLibrary(viewer.user, { force: url.searchParams.get('refresh') === '1' });
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
    // Safe by default on every list, including My Characters and search.
    if (!showNsfw) where.nsfw = false;

    let characters = await prisma.character.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { sessions: true } } },
    });
    if (characters.length === 0 && !mine && !search && !tag && await ensureDefaultCards()) {
      characters = await prisma.character.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { sessions: true } } },
      });
    }

    return NextResponse.json(
      characters.flatMap(({ _count, ...c }) => {
        const flagged = c.nsfw || characterImpliesNsfw(c);
        if (!showNsfw && flagged) return [];
        const editable = !!viewer && canEditCharacter(viewer, c);
        return [{
          id: c.id,
          name: c.name,
          title: c.title,
          summary: plainExcerpt(c.summary || c.scenario || ''),
          creator: c.creator,
          tags: tagList(c.tags || ''),
          avatar: c.avatar,
          banner: c.banner,
          updatedAt: c.updatedAt,
          nsfw: flagged,
          chatCount: _count?.sessions ?? 0,
          ownerId: c.ownerId,
          visibility: c.visibility,
          moderated: c.moderated,
          audioUrl: editable ? c.audioUrl : '',
        }];
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
    const nsfwCard = body?.nsfw === true || characterImpliesNsfw(body);
    if (nsfwCard && !canViewNsfw(viewer)) return nsfwLocked();
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
        nsfw: nsfwCard,
        visibility: parseVisibility(body?.visibility) ?? 'PRIVATE',
        moderated: false,
      },
    });
    void syncCharacterToCloud(character, viewer.user);
    return NextResponse.json({ ...character, firstMessage: character.initialMessage ?? '' }, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/characters error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to create character' }, { status: 500 });
  }
}
