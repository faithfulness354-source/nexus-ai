export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';

/** Render a character portrait on the local ComfyUI instance and store it on the card. */
export async function POST(request: NextRequest) {
  try {
    const { prisma } = await import('@/lib/db');
    const { getViewer, unauthorized, forbidden, canEditCharacter, canViewNsfw, nsfwLocked } = await import('@/lib/access');
    const { generateComfyImage } = await import('@/src/lib/comfy/client');
    const viewer = await getViewer();
    if (!viewer) return unauthorized();
    const body = await request.json().catch(() => ({}));
    const characterId = String(body?.characterId ?? '').trim();
    const prompt = String(body?.prompt ?? '').trim();
    const isNsfw = body?.isNsfw === true;
    if (!characterId) return NextResponse.json({ error: 'Character id is required.' }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: 'A portrait prompt is required.' }, { status: 400 });
    if (isNsfw && !canViewNsfw(viewer)) return nsfwLocked();

    const character = await prisma.character.findUnique({ where: { id: characterId }, select: { ownerId: true } });
    if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!canEditCharacter(viewer, character)) return forbidden('Only the creator of this character can change it.');

    const url = await generateComfyImage(prompt, isNsfw);
    const updated = await prisma.character.update({
      where: { id: characterId },
      data: { avatar: url },
      select: { id: true, avatar: true },
    });
    return NextResponse.json({ url: updated.avatar, characterId: updated.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Portrait generation failed.';
    console.error('POST /api/generate-portrait error:', message);
    const status = message === 'Portraits of minors are not allowed.' ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
