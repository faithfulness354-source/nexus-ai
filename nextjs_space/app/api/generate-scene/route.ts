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
import { GENERATE_TAG_RE, SCENE_TAG_RE } from '@/lib/scene-tags';
import { renderSceneImage, type SceneCharacter } from '@/lib/scene-image';
import { falConfigured } from '@/lib/fal/client';
import { messageContent } from '@/lib/llm/messages';
import {
  acquireGenerationSlot,
  bumpSceneGenerationCount,
  getSceneGenerationCount,
  GenerationLimitError,
  sceneAttemptPreview,
} from '@/lib/generation-limits';
import { canSceneGenerate, MAX_SCENE_REROLLS, sceneCreditCost } from '@/lib/reroll-costs';

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

/** Preview next scene credit cost / reroll remaining for a message. */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  const messageId = request.nextUrl.searchParams.get('messageId')?.trim() || '';
  if (!messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 });
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { session: { select: { userId: true } } },
  });
  if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  if (!canAccessSession(viewer, message.session)) return forbidden('This chat belongs to another account.');
  const preview = await sceneAttemptPreview(messageId);
  return NextResponse.json({
    ...preview,
    maxRerolls: MAX_SCENE_REROLLS,
    dailyImageCredits: viewer.isAdmin ? null : TIERS[viewer.tier].dailyImageCredits,
  });
}

/**
 * Production scene generation with escalating reroll costs + cooldown.
 *   { messageId } — render/reroll the scene tag on that message
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
  const forceReroll = body?.reroll === true;

  let sessionId = '';
  let description = '';
  let generateMatch: RegExpExecArray | null = null;
  let sceneMatch: RegExpExecArray | null = null;
  let messageIdToPatch: string | null = null;
  let originalContent = '';
  let character: CharacterRow | null = null;
  let stateKey = '';

  if (messageId) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { session: { include: { character: true } } },
    });
    if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    if (!canAccessSession(viewer, message.session)) return forbidden('This chat belongs to another account.');
    if (!message.session.character) return NextResponse.json({ error: 'This chat has no character.' }, { status: 400 });

    generateMatch = new RegExp(GENERATE_TAG_RE.source, 'i').exec(message.content);
    sceneMatch = new RegExp(SCENE_TAG_RE.source, 'i').exec(message.content);

    if (!generateMatch && !sceneMatch) {
      return NextResponse.json({ content: message.content, rendered: false });
    }
    if (sceneMatch && !generateMatch && !forceReroll) {
      // Already rendered — client should pass reroll:true for regenerations.
      const preview = await sceneAttemptPreview(messageId);
      return NextResponse.json({
        content: message.content,
        rendered: true,
        alreadyRendered: true,
        ...preview,
      });
    }

    description = (generateMatch?.[1] || sceneMatch?.[2] || '').trim();
    sessionId = message.sessionId;
    messageIdToPatch = message.id;
    originalContent = message.content;
    character = asSceneCharacter(message.session.character);
    stateKey = message.id;
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
    stateKey = `session:${session.id}:${description.slice(0, 80)}`;
  } else {
    return NextResponse.json({ error: 'Provide messageId, or sessionId with description.' }, { status: 400 });
  }

  const generationCount = await getSceneGenerationCount(stateKey);
  if (!canSceneGenerate(generationCount)) {
    return NextResponse.json(
      {
        error: `This scene has reached the maximum of ${MAX_SCENE_REROLLS} regenerations.`,
        code: 'SCENE_REROLL_LIMIT',
        generationCount,
        maxRerolls: MAX_SCENE_REROLLS,
      },
      { status: 429 },
    );
  }

  const cost = sceneCreditCost(generationCount);
  let slot: Awaited<ReturnType<typeof acquireGenerationSlot>> | null = null;
  let charged = 0;

  try {
    slot = await acquireGenerationSlot(viewer.user.id, 'image');
  } catch (err) {
    if (err instanceof GenerationLimitError) {
      return NextResponse.json(
        { error: err.message, code: err.code, ...(err.meta ?? {}) },
        { status: err.status },
      );
    }
    throw err;
  }

  if (!(await consumeImageCredit(viewer, cost))) {
    await slot.release();
    return NextResponse.json(
      {
        error: `Need ${cost} image credit${cost === 1 ? '' : 's'} for this render. You've used your daily image credits (or don't have enough left). They reset at midnight UTC.`,
        code: 'OUT_OF_IMAGE_CREDITS',
        feature: 'sceneImages',
        tier: viewer.tier,
        cost,
      },
      { status: 429 },
    );
  }
  charged = cost;

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

    const nextCount = await bumpSceneGenerationCount(stateKey, viewer.user.id);

    let content: string | undefined;
    if (messageIdToPatch) {
      const fresh = await prisma.message.findUnique({ where: { id: messageIdToPatch } });
      const base = fresh?.content ?? originalContent;
      const replacement = `[SCENE_IMAGE: ${result.url} | ${description.replace(/[\[\]]/g, '')}]`;
      if (generateMatch && base.includes(generateMatch[0])) {
        content = base.replace(generateMatch[0], replacement);
      } else if (sceneMatch && base.includes(sceneMatch[0])) {
        content = base.replace(sceneMatch[0], replacement);
      } else {
        content = `${base.trim()}\n\n${replacement}`;
      }
      await prisma.message.update({ where: { id: messageIdToPatch }, data: { content } });
    }

    await slot.release();
    const preview = await sceneAttemptPreview(stateKey);
    return NextResponse.json({
      rendered: true,
      url: result.url,
      cloud_storage_path: result.cloud_storage_path,
      engine: result.engine,
      promptModel: result.promptModel,
      referencesUsed: result.referencesUsed,
      content,
      creditsCharged: charged,
      generationCount: nextCount,
      next: preview,
    });
  } catch (err: any) {
    if (charged) await refundImageCredit(viewer, charged).catch(() => {});
    await slot?.release();
    console.error('POST /api/generate-scene error:', err);
    return NextResponse.json({ error: err?.message ?? 'Scene render failed' }, { status: 502 });
  }
}
