export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, can, canViewNsfw, nsfwLocked, canEditCharacter } from '@/lib/access';
import { normalizeAudioUrl } from '@/lib/audio-url';
import { parseVisibility } from '@/lib/card-visibility';
import { syncCharacterToCloud } from '@/lib/supabase/sync';
import { cardFirstMessage, savedFirstMessage, savedStaticField } from '@/lib/opening';
import { pullCloudLibrary } from '@/lib/supabase/apply';
import { characterImpliesNsfw } from '@/lib/nsfw-notice';
import { rateCharacterContent, sfwViolationResponse } from '@/lib/content-rating';
import { ensureDefaultCards } from '@/lib/ensure-default-cards';
import { adultCardsEnabled } from '@/lib/nsfw-account';
import { refreshCharacterVisual } from '@/lib/vision/vlm';
import { gateAvatarImage, avatarGateResponse } from '@/lib/vision/image-moderation';
import { ensureVisualColumns } from '@/lib/ensure-visual-columns';
import { moderateGenerationText, logModerationFlag, moderationBlockedResponse } from '@/lib/trust-safety';

function plainExcerpt(value: string, limit = 280) {
  const text = value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit).trim()}…` : text;
}

function tagList(tags: string) {
  return tags.split(',').map((tag) => tag.trim()).filter(Boolean);
}

export async function GET(request: NextRequest) {
  try {
    // Heal missing VLM columns before any Character query (additive only; no data loss).
    await ensureVisualColumns();
    const url = new URL(request.url);
    const search = url.searchParams.get('search') ?? '';
    const tag = url.searchParams.get('tag') ?? '';
    const mine = url.searchParams.get('mine') === 'true';
    const viewer = await getViewer();
    const showNsfw = await adultCardsEnabled(viewer);
    const filters: Record<string, unknown>[] = [];
    if (mine) {
      if (!viewer) return unauthorized();
      await pullCloudLibrary(viewer.user, { force: url.searchParams.get('refresh') === '1' });
      filters.push({ ownerId: viewer.user.id });
    } else if (viewer) {
      filters.push({
        OR: [
          { visibility: 'PUBLIC', moderated: false },
          { ownerId: viewer.user.id },
        ],
      });
    } else {
      filters.push({ visibility: 'PUBLIC', moderated: false });
    }
    if (search) {
      filters.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { summary: { contains: search, mode: 'insensitive' } },
          { scenario: { contains: search, mode: 'insensitive' } },
          { creator: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    if (tag) filters.push({ tags: { contains: tag, mode: 'insensitive' } });
    // A turned-off NSFW setting hides adult cards everywhere, including the owner's own lists.
    if (!showNsfw) {
      filters.push({ nsfw: false });
    }
    const where = { AND: filters };

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
    const rating = rateCharacterContent(body);
    const wantsNsfw = body?.nsfw === true;
    // SFW-marked cards that violate SFW rules are rejected before any Supabase/Prisma write.
    if (!wantsNsfw && rating.isNsfw) return sfwViolationResponse(rating);
    const nsfwCard = wantsNsfw || rating.isNsfw;
    if (nsfwCard && !canViewNsfw(viewer)) return nsfwLocked();

    const prohibited = moderateGenerationText(
      body?.name, body?.summary, body?.personality, body?.scenario,
      body?.initialMessage ?? body?.firstMessage, body?.exampleDialogue, body?.systemPrompt, body?.creatorNotes,
    );
    if (!prohibited.allowed) {
      await logModerationFlag({
        userId: viewer.user.id,
        route: '/api/characters',
        category: prohibited.category || 'illegal',
        matched: prohibited.matched,
      });
      return moderationBlockedResponse(prohibited);
    }

    // VLM image gate before any Prisma/Supabase write (multi-signal underage + SFW nudity).
    const imageBlock = await gateAvatarImage({ imageUrl: body?.avatar, wantsNsfw: nsfwCard });
    if (imageBlock) {
      if (imageBlock.kind === 'underage') {
        await logModerationFlag({
          userId: viewer.user.id,
          route: '/api/characters',
          category: 'minors',
          matched: 'vlm_underage_multi_signal',
        });
      }
      return avatarGateResponse(imageBlock);
    }

    const character = await prisma.character.create({
      data: {
        ownerId: viewer.user.id,
        name: body?.name ?? 'Unnamed',
        title: String(body?.title ?? '').trim(),
        gallery: Array.isArray(body?.gallery) ? body.gallery : [],
        sceneImages: body?.sceneImages ?? true,
        summary: savedStaticField(body, 'summary') ?? '',
        personality: savedStaticField(body, 'personality') ?? '',
        scenario: savedStaticField(body, 'scenario') ?? '',
        initialMessage: savedFirstMessage(body) ?? '',
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
    void refreshCharacterVisual(character.id, character.avatar);
    try {
      await syncCharacterToCloud(character, viewer.user);
    } catch (error) {
      console.error('Character cloud sync failed', error instanceof Error ? error.message : '');
      return NextResponse.json(
        { error: 'The card was saved, but Supabase did not store the bio, scenario, personality, and first message.' },
        { status: 502 },
      );
    }
    return NextResponse.json({ ...character, firstMessage: cardFirstMessage({ initialMessage: character.initialMessage }) }, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/characters error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to create character' }, { status: 500 });
  }
}
