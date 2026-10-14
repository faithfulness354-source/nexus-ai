export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, forbidden, canEditCharacter, can, canViewNsfw, nsfwLocked } from '@/lib/access';
import { characterImpliesNsfw } from '@/lib/nsfw-notice';
import { adultCardsEnabled } from '@/lib/nsfw-account';
import { normalizeAudioUrl } from '@/lib/audio-url';
import { canViewCharacter, parseVisibility } from '@/lib/card-visibility';
import { deleteCharacterFromCloud, syncCharacterToCloud } from '@/lib/supabase/sync';

function parseStoredTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim().replace(/^#+/, '')).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parseStoredTags(parsed);
    } catch { /* comma list */ }
  }
  return trimmed.split(',').map((tag) => tag.trim().replace(/^#+/, '')).filter(Boolean);
}

/** Full record for the editor. Tags are returned as a list so the form can bind them. */
function presentCharacter(character: any, includeAudio: boolean) {
  return {
    ...character,
    nsfw: !!character.nsfw || characterImpliesNsfw(character),
    tags: parseStoredTags(character.tags),
    audioUrl: includeAudio ? character.audioUrl ?? '' : '',
    firstMessage: character.initialMessage ?? character.firstMessage ?? '',
  };
}

/** Trimmed, '#'-stripped, case-insensitively de-duplicated tag list. */
function normalizeTags(tags: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const tag = String(t ?? '').trim().replace(/^#+/, '').slice(0, 40);
    if (tag && !seen.has(tag.toLowerCase())) { seen.add(tag.toLowerCase()); out.push(tag); }
  }
  return out.slice(0, 30);
}

/** Signed-in viewer allowed to modify character `id`, or the error Response. */
async function requireEditor(id: string) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  const c = await prisma.character.findUnique({ where: { id }, select: { ownerId: true } });
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canEditCharacter(viewer, c)) return forbidden('Only the creator of this character can change it.');
  return viewer;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const character = await prisma.character.findUnique({ where: { id } });
    if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const viewer = await getViewer();
    if (!canViewCharacter(viewer ? { isCreatorAdmin: viewer.isCreatorAdmin, userId: viewer.user.id } : null, character)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if ((character.nsfw || characterImpliesNsfw(character)) && !(await adultCardsEnabled(viewer))) return nsfwLocked();
    const includeAudio = !!viewer && canEditCharacter(viewer, character);
    return NextResponse.json(presentCharacter(character, includeAudio));
  } catch (err: any) {
    console.error('GET /api/characters/[id] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const viewer = await requireEditor(id);
    if (viewer instanceof Response) return viewer;
    const body = await request.json();
    const fullCard = body?.name !== undefined || body?.summary !== undefined || body?.personality !== undefined || body?.scenario !== undefined;
    const nsfwCard = body?.nsfw === true || (fullCard && characterImpliesNsfw(body));
    if (nsfwCard && !canViewNsfw(viewer)) return nsfwLocked();
    const audioUrl = body?.audioUrl === undefined ? undefined : normalizeAudioUrl(body.audioUrl);
    if (audioUrl === '' && String(body?.audioUrl ?? '').trim()) {
      return NextResponse.json({ error: 'Use Choose audio to add an mp3. A computer file path is not saved.' }, { status: 400 });
    }
    const character = await prisma.character.update({
      where: { id },
      data: {
        name: body?.name,
        title: body?.title === undefined ? undefined : String(body.title).trim(),
        gallery: Array.isArray(body?.gallery) ? body.gallery : undefined,
        sceneImages: typeof body?.sceneImages === 'boolean' ? body.sceneImages : undefined,
        summary: body?.summary,
        personality: body?.personality,
        scenario: body?.scenario,
        initialMessage: body?.firstMessage === undefined && body?.initialMessage === undefined
          ? undefined
          : String(body?.firstMessage ?? body?.initialMessage ?? ''),
        exampleDialogue: body?.exampleDialogue,
        customRules: body?.customRules,
        systemPrompt: can(viewer, 'customPrompts') ? body?.systemPrompt : undefined,
        creatorNotes: body?.creatorNotes,
        tags: Array.isArray(body?.tags) ? normalizeTags(body.tags).join(', ') : undefined,
        avatar: body?.avatar === undefined ? undefined : body.avatar || null,
        banner: body?.banner === undefined ? undefined : body.banner || null,
        audioUrl,
        creator: body?.creator === undefined ? undefined : (String(body.creator).trim() || 'Anonymous'),
        nsfw: fullCard || typeof body?.nsfw === 'boolean' ? nsfwCard : undefined,
        visibility: body?.visibility === undefined ? undefined : (parseVisibility(body.visibility) ?? undefined),
        moderated: viewer.isCreatorAdmin && typeof body?.moderated === 'boolean' ? body.moderated : undefined,
      },
    });
    void syncCharacterToCloud(character, viewer.user);
    return NextResponse.json(character);
  } catch (err: any) {
    console.error('PUT /api/characters/[id] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const viewer = await requireEditor(id);
    if (viewer instanceof Response) return viewer;
    await prisma.character.delete({ where: { id } });
    void deleteCharacterFromCloud(id, viewer.user);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/characters/[id] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}
