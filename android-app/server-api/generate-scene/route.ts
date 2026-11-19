export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 180;

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  getViewer,
  unauthorized,
  forbidden,
  canAccessSession,
  can,
  canViewNsfw,
  consumeImageCredit,
  refundImageCredit,
} from '@/lib/access';
import { TIERS } from '@/lib/tiers';
import { GENERATE_TAG_RE } from '@/lib/scene-tags';
import { renderSceneImage, type SceneCharacter } from '@/lib/scene-image';
import { falConfigured } from '@/lib/fal/client';
import { messageContent } from '@/lib/llm/messages';

type CharacterRow = SceneCharacter & {
  personality?: string | null;
  summary?: string | null;
};

function asSceneCharacter(character: any): CharacterRow {
  return {
    name: character.name,
    avatar: character.avatar,
    gallery: character.gallery,
    nsfw: character.nsfw,
    personality: character.personality,
    summary: character.summary,
    visualDescription: character.visualDescription ?? null,
    visualAnchor: character.visualAnchor ?? null,
  };
}

/**
 * Production scene generation: Ultimate image credits → LLM visual prompt → fal-ai/flux-2
 * → durable Supabase `scene-renders` URL. Accepts either:
 *   { messageId } — render the first pending [GENERATE_IMAGE] tag in that message
 *   { sessionId, description } — free-form scene for the session's character
 */
export async function POST(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();

  if (!can(viewer, 'sceneImages')) {
    return NextResponse.json(
      { error: 'Dynamic scene images are part of the Ultimate plan.', code: 'UPGRADE_REQUIRED', feature: 'sceneImages' },
      { status: 402 },
    );
  }
  if (!falConfigured()) {
    return NextResponse.json({ error: 'Scene rendering is not configured (missing FAL_KEY).', code: 'FAL_NOT_CONFIGURED' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const messageId = typeof body?.messageId === 'string' ? body.messageId.trim() : '';
  const sessionIdIn = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
  const freeDescription = typeof body?.description === 'string' ? body.description.trim() : '';

  let sessionId = '';
  let description = '';
  let tagMatch: RegExpExecArray | null = null;
  let messageIdToPatch: string | null = null;
  let originalContent = '';
  let character: CharacterRow | null = null;

  if (messageId) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { session: { include: { character: true } } },
    });
    if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    if (!canAccessSession(viewer, message.session)) return forbidden('This chat belongs to another account.');
    if (!message.session.character) return NextResponse.json({ error: 'This chat has no character.' }, { status: 400 });
    tagMatch = new RegExp(GENERATE_TAG_RE.source, 'i').exec(message.content);
    if (!tagMatch) {
      return NextResponse.json({ content: message.content, rendered: false });
    }
    description = tagMatch[1].trim();
    sessionId = message.sessionId;
    messageIdToPatch = message.id;
    originalContent = message.content;
    character = asSceneCharacter(message.session.character);
  } else if (sessionIdIn && freeDescription) {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionIdIn },
      include: { character: true },
    });
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!canAccessSession(viewer, session)) return forbidden('This chat belongs to another account.');
    if (!session.character) return NextResponse.json({ error: 'This chat has no character.' }, { status: 400 });
    sessionId = session.id;
    description = freeDescription;
    character = asSceneCharacter(session.character);
  } else {
    return NextResponse.json({ error: 'Provide messageId, or sessionId with description.' }, { status: 400 });
  }

  if (!(await consumeImageCredit(viewer))) {
    return NextResponse.json(
      {
        error: `You've used all ${TIERS[viewer.tier].dailyImageCredits} image credits for today. They reset at midnight UTC.`,
        code: 'OUT_OF_IMAGE_CREDITS',
        feature: 'sceneImages',
        tier: viewer.tier,
      },
      { status: 429 },
    );
  }

  try {
    const recent = await prisma.message.findMany({
      where: { sessionId, deleted: false },
      orderBy: { index: 'desc' },
      take: 6,
      select: { role: true, content: true },
    });
    const recentMessages = recent
      .reverse()
      .map((m) => ({ role: m.role, content: messageContent(m.content) }))
      .slice(-3);

    const allowNsfwSafetyOff = canViewNsfw(viewer) && (viewer.tier === 'PREMIUM' || viewer.tier === 'ULTIMATE' || viewer.isAdmin);

    const result = await renderSceneImage(character!, description, {
      userId: viewer.user.id,
      sessionId,
      recentMessages,
      allowNsfwSafetyOff,
      landscape: body?.landscape === true,
    });

    let content: string | undefined;
    if (messageIdToPatch && tagMatch) {
      const fresh = await prisma.message.findUnique({ where: { id: messageIdToPatch } });
      const base = fresh?.content ?? originalContent;
      content = base.includes(tagMatch[0])
        ? base.replace(tagMatch[0], `[SCENE_IMAGE: ${result.url} | ${description.replace(/[\[\]]/g, '')}]`)
        : base;
      await prisma.message.update({ where: { id: messageIdToPatch }, data: { content } });
    }

    return NextResponse.json({
      rendered: true,
      url: result.url,
      cloud_storage_path: result.cloud_storage_path,
      engine: result.engine,
      promptModel: result.promptModel,
      referencesUsed: result.referencesUsed,
      content,
    });
  } catch (err: any) {
    await refundImageCredit(viewer).catch(() => {});
    console.error('POST /api/generate-scene error:', err);
    return NextResponse.json({ error: err?.message ?? 'Scene render failed' }, { status: 502 });
  }
}
