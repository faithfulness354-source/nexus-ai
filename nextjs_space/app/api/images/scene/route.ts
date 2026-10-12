export const dynamic = 'force-dynamic';
export const maxDuration = 180;
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { renderSceneImage } from '@/lib/scene-image';
import { GENERATE_TAG_RE } from '@/lib/scene-tags';
import { getViewer, unauthorized, forbidden, canAccessSession, can, consumeImageCredit, refundImageCredit } from '@/lib/access';
import { TIERS } from '@/lib/tiers';

/** Renders the first pending [GENERATE_IMAGE: ...] tag in a message and swaps in the finished image. */
export async function POST(request: NextRequest) {
  try {
    const viewer = await getViewer();
    if (!viewer) return unauthorized();
    if (!can(viewer, 'sceneImages')) {
      return NextResponse.json(
        { error: 'Dynamic scene images are part of the Ultimate plan.', code: 'UPGRADE_REQUIRED', feature: 'sceneImages' },
        { status: 402 },
      );
    }
    const { messageId } = (await request.json()) ?? {};
    if (!messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 });

    const message = await prisma.message.findUnique({
      where: { id: String(messageId) },
      include: { session: { include: { character: true } } },
    });
    if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    if (!canAccessSession(viewer, message.session)) return forbidden('This chat belongs to another account.');

    const match = new RegExp(GENERATE_TAG_RE.source, 'i').exec(message.content);
    if (!match) return NextResponse.json({ content: message.content, rendered: false });

    if (!(await consumeImageCredit(viewer))) {
      return NextResponse.json(
        { error: `You've used all ${TIERS[viewer.tier].dailyImageCredits} image credits for today. They reset at midnight UTC.`, code: 'OUT_OF_IMAGE_CREDITS' },
        { status: 429 },
      );
    }

    const description = match[1].trim();
    const character = message.session.character;
    let result;
    try {
      result = await renderSceneImage(
        { name: character.name, avatar: character.avatar, gallery: character.gallery, nsfw: character.nsfw },
        description,
      );
    } catch (err) {
      await refundImageCredit(viewer);
      throw err;
    }

    // Re-read so a concurrent edit isn't clobbered; replace only this tag.
    const fresh = await prisma.message.findUnique({ where: { id: message.id } });
    const base = fresh?.content ?? message.content;
    const content = base.includes(match[0])
      ? base.replace(match[0], `[SCENE_IMAGE: ${result.url} | ${description.replace(/[\[\]]/g, '')}]`)
      : base;
    await prisma.message.update({ where: { id: message.id }, data: { content } });

    return NextResponse.json({ content, rendered: true, engine: result.engine, referencesUsed: result.referencesUsed });
  } catch (err: any) {
    console.error('POST /api/images/scene error:', err);
    return NextResponse.json({ error: err?.message ?? 'Scene render failed' }, { status: 502 });
  }
}
