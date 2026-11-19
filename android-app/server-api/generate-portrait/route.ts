export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, forbidden, canEditCharacter, canViewNsfw, nsfwLocked } from '@/lib/access';
import { falConfigured, generateFalScene } from '@/lib/fal/client';
import { persistSceneRender } from '@/lib/fal/storage';
import { SCENE_STYLE_ANCHOR, sanitizeVisualSource } from '@/lib/fal/scene-prompt';

/** Render a character portrait via fal-ai/flux-2 and store the durable URL on the card. */
export async function POST(request: NextRequest) {
  try {
    const viewer = await getViewer();
    if (!viewer) return unauthorized();
    if (!falConfigured()) {
      return NextResponse.json({ error: 'Portrait generation is not configured (missing FAL_KEY).' }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const characterId = String(body?.characterId ?? '').trim();
    const prompt = sanitizeVisualSource(String(body?.prompt ?? ''));
    const isNsfw = body?.isNsfw === true;
    if (!characterId) return NextResponse.json({ error: 'Character id is required.' }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: 'A portrait prompt is required.' }, { status: 400 });
    if (isNsfw && !canViewNsfw(viewer)) return nsfwLocked();

    const character = await prisma.character.findUnique({ where: { id: characterId }, select: { ownerId: true } });
    if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!canEditCharacter(viewer, character)) return forbidden('Only the creator of this character can change it.');

    if (/\b(child|children|minor|minors|underage|preteen|toddler|infant|loli|lolita|shota)\b/i.test(prompt)) {
      return NextResponse.json({ error: 'Portraits of minors are not allowed.' }, { status: 400 });
    }

    const visual = `${prompt}, portrait, head and shoulders, adult character. ${SCENE_STYLE_ANCHOR}`;
    const fal = await generateFalScene({
      prompt: visual,
      disableSafetyChecker: isNsfw && canViewNsfw(viewer) && (viewer.tier === 'PREMIUM' || viewer.tier === 'ULTIMATE' || viewer.isAdmin),
    });
    const stored = await persistSceneRender({
      falImageUrl: fal.url,
      userId: viewer.user.id,
    });

    const updated = await prisma.character.update({
      where: { id: characterId },
      data: { avatar: stored.url },
      select: { id: true, avatar: true },
    });
    return NextResponse.json({ url: updated.avatar, characterId: updated.id, engine: fal.model });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Portrait generation failed.';
    console.error('POST /api/generate-portrait error:', message);
    const status = message === 'Portraits of minors are not allowed.' ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
