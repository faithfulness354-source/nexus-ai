import 'server-only';
import { prisma } from '@/lib/db';
import { ensureGenerationLimitTables } from '@/lib/ensure-generation-limits';
import {
  IMAGE_COOLDOWN_MS,
  TEXT_COOLDOWN_MS,
  canSceneGenerate,
  canTextSwipe,
  sceneCreditCost,
  textSwipeCreditCost,
} from '@/lib/reroll-costs';

export type GenerationKind = 'text' | 'image';

export class GenerationLimitError extends Error {
  status: number;
  code: string;
  meta?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.meta = meta;
  }
}

export async function getSceneGenerationCount(messageId: string): Promise<number> {
  await ensureGenerationLimitTables();
  const rows = await prisma.$queryRawUnsafe<Array<{ generation_count: number }>>(
    `SELECT generation_count FROM public.scene_generation_state WHERE message_id = $1`,
    messageId,
  );
  return Number(rows[0]?.generation_count ?? 0);
}

export async function bumpSceneGenerationCount(messageId: string, userId: string): Promise<number> {
  await ensureGenerationLimitTables();
  const rows = await prisma.$queryRawUnsafe<Array<{ generation_count: number }>>(
    `INSERT INTO public.scene_generation_state (message_id, user_id, generation_count, updated_at)
     VALUES ($1, $2, 1, now())
     ON CONFLICT (message_id) DO UPDATE
       SET generation_count = public.scene_generation_state.generation_count + 1,
           updated_at = now(),
           user_id = EXCLUDED.user_id
     RETURNING generation_count`,
    messageId,
    userId,
  );
  return Number(rows[0]?.generation_count ?? 1);
}

export async function getTextSwipeCount(turnId: string): Promise<number> {
  await ensureGenerationLimitTables();
  const rows = await prisma.$queryRawUnsafe<Array<{ swipe_count: number }>>(
    `SELECT swipe_count FROM public.text_swipe_state WHERE turn_id = $1`,
    turnId,
  );
  return Number(rows[0]?.swipe_count ?? 0);
}

export async function bumpTextSwipeCount(turnId: string, sessionId: string, userId: string): Promise<number> {
  await ensureGenerationLimitTables();
  const rows = await prisma.$queryRawUnsafe<Array<{ swipe_count: number }>>(
    `INSERT INTO public.text_swipe_state (turn_id, session_id, user_id, swipe_count, updated_at)
     VALUES ($1, $2, $3, 1, now())
     ON CONFLICT (turn_id) DO UPDATE
       SET swipe_count = public.text_swipe_state.swipe_count + 1,
           updated_at = now()
     RETURNING swipe_count`,
    turnId,
    sessionId,
    userId,
  );
  return Number(rows[0]?.swipe_count ?? 1);
}

/** Preview scene cost / remaining capacity for UI. */
export async function sceneAttemptPreview(messageId: string): Promise<{
  generationCount: number;
  rerollCount: number;
  cost: number;
  allowed: boolean;
  label: string;
}> {
  const generationCount = await getSceneGenerationCount(messageId);
  const allowed = canSceneGenerate(generationCount);
  const cost = sceneCreditCost(generationCount);
  const rerollCount = Math.max(0, generationCount - 1);
  const label = !allowed
    ? 'Reroll limit reached'
    : generationCount <= 0
      ? `Generate (${cost} Credit${cost === 1 ? '' : 's'})`
      : `Regenerate (${cost} Credit${cost === 1 ? '' : 's'})`;
  return { generationCount, rerollCount, cost, allowed, label };
}

export async function textSwipePreview(turnId: string): Promise<{
  swipeCount: number;
  cost: number;
  allowed: boolean;
}> {
  const swipeCount = await getTextSwipeCount(turnId);
  return {
    swipeCount,
    cost: textSwipeCreditCost(swipeCount),
    allowed: canTextSwipe(swipeCount),
  };
}

/**
 * Acquire a per-user cooldown slot. Throws GenerationLimitError on cooldown / concurrency.
 * Caller must always invoke the returned release() (success or failure).
 */
export async function acquireGenerationSlot(
  userId: string,
  kind: GenerationKind,
): Promise<{ release: (opts?: { failed?: boolean }) => Promise<void> }> {
  await ensureGenerationLimitTables();
  const cooldownMs = kind === 'image' ? IMAGE_COOLDOWN_MS : TEXT_COOLDOWN_MS;
  const now = new Date();

  const existing = await prisma.$queryRawUnsafe<Array<{ last_at: Date; in_flight: boolean }>>(
    `SELECT last_at, in_flight FROM public.generation_cooldowns WHERE user_id = $1 AND kind = $2`,
    userId,
    kind,
  );
  const row = existing[0];
  if (row?.in_flight && kind === 'image') {
    throw new GenerationLimitError(429, 'GENERATION_IN_FLIGHT', 'An image generation is already in progress. Wait for it to finish.', {
      kind,
    });
  }
  if (row?.last_at) {
    const elapsed = now.getTime() - new Date(row.last_at).getTime();
    if (elapsed < cooldownMs) {
      const retryAfterMs = cooldownMs - elapsed;
      throw new GenerationLimitError(
        429,
        'GENERATION_COOLDOWN',
        kind === 'image'
          ? `Please wait ${Math.ceil(retryAfterMs / 1000)}s before generating another image.`
          : `Please wait ${Math.ceil(retryAfterMs / 1000)}s before sending another message.`,
        { kind, retryAfterMs, retryAfterSec: Math.ceil(retryAfterMs / 1000) },
      );
    }
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO public.generation_cooldowns (user_id, kind, last_at, in_flight)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, kind) DO UPDATE
       SET last_at = EXCLUDED.last_at,
           in_flight = EXCLUDED.in_flight`,
    userId,
    kind,
    now,
    kind === 'image',
  );

  let released = false;
  return {
    release: async () => {
      if (released) return;
      released = true;
      if (kind !== 'image') return;
      await prisma.$executeRawUnsafe(
        `UPDATE public.generation_cooldowns SET in_flight = false WHERE user_id = $1 AND kind = $2`,
        userId,
        kind,
      ).catch(() => {});
    },
  };
}
