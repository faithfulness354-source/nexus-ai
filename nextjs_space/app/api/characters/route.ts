export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, can, canViewNsfw, nsfwLocked, canEditCharacter } from '@/lib/access';
import { normalizeAudioUrl } from '@/lib/audio-url';
import { parseVisibility } from '@/lib/card-visibility';
import { syncCharacterToCloud } from '@/lib/supabase/sync';
import { cardFirstMessage, savedFirstMessage, savedStaticField } from '@/lib/opening';
import { pullCloudLibrary } from '@/lib/supabase/apply';
import { characterBrowseImpliesNsfw } from '@/lib/nsfw-notice';
import { rateCharacterContent, sfwViolationResponse } from '@/lib/content-rating';
import { ensureDefaultCards } from '@/lib/ensure-default-cards';
import { adultCardsEnabled } from '@/lib/nsfw-account';
import { refreshCharacterVisual } from '@/lib/vision/vlm';
import { gateAvatarImage, avatarGateResponse } from '@/lib/vision/image-moderation';
import { withVisualColumnRetry } from '@/lib/ensure-visual-columns';
import { moderateGenerationText, logModerationFlag, moderationBlockedResponse } from '@/lib/trust-safety';

function plainExcerpt(value: string, limit = 280) {
  const text = value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit).trim()}…` : text;
}

function tagList(tags: string) {
  return tags.split(',').map((tag) => tag.trim()).filter(Boolean);
}

/** List projection — avoid loading huge VLM blobs on every Discover request. */
const CHARACTER_LIST_SELECT = {
  id: true,
  name: true,
  title: true,
  summary: true,
  personality: true,
  scenario: true,
  initialMessage: true,
  tags: true,
  avatar: true,
  banner: true,
  gallery: true,
  audioUrl: true,
  creator: true,
  nsfw: true,
  visibility: true,
  moderated: true,
  ownerId: true,
  updatedAt: true,
} as const;

type CharacterListRow = {
  id: string;
  name: string;
  title: string | null;
  summary: string | null;
  personality?: string | null;
  scenario: string | null;
  initialMessage?: string | null;
  tags: string | null;
  avatar: string | null;
  banner: string | null;
  gallery?: unknown;
  audioUrl?: string | null;
  creator: string | null;
  nsfw: boolean | null;
  visibility: string | null;
  moderated: boolean | null;
  ownerId: string | null;
  updatedAt: Date;
  _count?: { sessions?: number };
};

async function loadCharacterRows(where: Record<string, unknown>, label: string): Promise<{ rows: CharacterListRow[]; degraded: boolean; detail?: string }> {
  try {
    const rows = await withVisualColumnRetry<CharacterListRow[] | null>(
      async () => prisma.character.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        select: {
          ...CHARACTER_LIST_SELECT,
          _count: { select: { sessions: true } },
        },
      }) as Promise<CharacterListRow[]>,
      null,
      label,
    );
    if (Array.isArray(rows)) return { rows, degraded: false };
  } catch (err) {
    console.warn(`[${label}] with _count failed:`, err instanceof Error ? err.message : err);
  }

  try {
    const rows = await withVisualColumnRetry<CharacterListRow[] | null>(
      async () => prisma.character.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        select: CHARACTER_LIST_SELECT,
      }) as Promise<CharacterListRow[]>,
      null,
      `${label} no-count`,
    );
    if (Array.isArray(rows)) {
      return {
        rows: rows.map((row) => ({ ...row, _count: { sessions: 0 } })),
        degraded: true,
        detail: 'Chat counts unavailable; cards still listed.',
      };
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[${label}] fallback findMany failed:`, detail);
    return { rows: [], degraded: true, detail: detail.slice(0, 240) };
  }

  return { rows: [], degraded: true, detail: 'Character catalog query returned no rows after schema heal.' };
}

function catalogHeaders(count: number, degraded?: boolean, detail?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    'X-Nexus-Characters-Count': String(count),
  };
  if (degraded) {
    headers['X-Nexus-Characters-Degraded'] = '1';
    if (detail) headers['X-Nexus-Characters-Error'] = detail.slice(0, 180);
  }
  return headers;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get('search') ?? '';
    const tag = url.searchParams.get('tag') ?? '';
    const mine = url.searchParams.get('mine') === 'true';
    // Client preference (`nsfw=true|false`); adult entitlement still gates actual NSFW rows.
    // Missing param keeps prior behavior for entitled viewers (include NSFW when allowed).
    const nsfwParam = url.searchParams.get('nsfw');
    let viewer: Awaited<ReturnType<typeof getViewer>> = null;
    try {
      viewer = await getViewer();
    } catch (err) {
      console.warn('GET /api/characters getViewer failed:', err instanceof Error ? err.message : err);
      viewer = null;
    }
    if (mine && !viewer) return unauthorized();

    const entitledNsfw = await adultCardsEnabled(viewer).catch(() => false);
    const showNsfw = entitledNsfw && (nsfwParam === null ? true : nsfwParam === 'true');
    const filters: Record<string, unknown>[] = [];
    if (mine && viewer) {
      await pullCloudLibrary(viewer.user, { force: url.searchParams.get('refresh') === '1' }).catch((err) => {
        console.warn('pullCloudLibrary skipped', err instanceof Error ? err.message : err);
      });
      filters.push({ ownerId: viewer.user.id });
    } else if (viewer) {
      // Browse: every public card + the viewer's own drafts/private cards.
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

    let { rows: characters, degraded, detail } = await loadCharacterRows(where, 'GET /api/characters');
    if (characters.length === 0 && !mine && !search && !tag && await ensureDefaultCards()) {
      const retry = await loadCharacterRows(where, 'GET /api/characters seed-retry');
      characters = retry.rows;
      degraded = degraded || retry.degraded;
      detail = detail || retry.detail;
    }

    const payload = characters.flatMap((c) => {
      try {
        const flagged = c.nsfw === true || characterBrowseImpliesNsfw(c);
        if (!showNsfw && flagged) return [];
        const editable = !!viewer && canEditCharacter(viewer, c as any);
        return [{
          id: c.id,
          name: c.name,
          title: c.title ?? '',
          summary: plainExcerpt(c.summary || c.scenario || ''),
          creator: c.creator ?? 'Anonymous',
          tags: tagList(typeof c.tags === 'string' ? c.tags : ''),
          avatar: c.avatar ?? null,
          banner: c.banner ?? null,
          updatedAt: c.updatedAt,
          nsfw: flagged,
          chatCount: c._count?.sessions ?? 0,
          ownerId: c.ownerId ?? null,
          visibility: c.visibility ?? 'PRIVATE',
          moderated: c.moderated === true,
          audioUrl: editable ? (c.audioUrl ?? '') : '',
        }];
      } catch (err) {
        console.warn('Skipping catalog row', c?.id, err instanceof Error ? err.message : err);
        return [];
      }
    });

    // Always HTTP 200 + JSON array so Discover never shows "Catalog request failed (5xx)".
    return NextResponse.json(payload, {
      status: 200,
      headers: catalogHeaders(payload.length, degraded, detail),
    });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('GET /api/characters error:', detail);
    // Prefer an empty public catalog over a hard 500/503 — gallery clients expect an array.
    return NextResponse.json([], {
      status: 200,
      headers: catalogHeaders(0, true, detail),
    });
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
