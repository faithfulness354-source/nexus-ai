import 'server-only';
import { createHash } from 'crypto';
import { prisma } from '@/lib/db';
import { ensureGenerationLimitTables } from '@/lib/ensure-generation-limits';
import { canViewNsfw, type Viewer } from '@/lib/access';
import { readAccountNsfwEnabled } from '@/lib/nsfw-account';
import { htmlToPlainText } from '@/lib/rich-text';

/** Deterministic SHA-256 of the account id — used as fal.ai `user` safety metadata. */
export function hashUserId(userId: string): string {
  return createHash('sha256').update(String(userId)).digest('hex');
}

export function isAdultVerifiedUser(user: { termsAccepted?: boolean | null; termsAcceptedAt?: Date | null }): boolean {
  return user.termsAccepted === true || !!user.termsAcceptedAt;
}

/** Premium/Ultimate (or admin) may request NSFW generations after adult verification. */
export function hasNsfwSubscription(viewer: Viewer): boolean {
  if (viewer.isAdmin || viewer.isCreatorAdmin) return true;
  return canViewNsfw(viewer) && (viewer.tier === 'PREMIUM' || viewer.tier === 'ULTIMATE');
}

export interface SafetyCheckerDecision {
  enableSafetyChecker: boolean;
  reason: string;
  isAdultVerified: boolean;
  nsfwEnabled: boolean;
  hasPaidNsfwPlan: boolean;
}

/**
 * Only Premium+/Ultimate with server-side 18+ verification and NSFW preference may disable fal safety.
 * Free/Plus, unverified, SFW-only profile/card → always enable_safety_checker: true.
 */
export async function resolveSafetyChecker(viewer: Viewer, opts?: {
  characterNsfw?: boolean | null;
  requestNsfw?: boolean;
}): Promise<SafetyCheckerDecision> {
  const isAdultVerified = isAdultVerifiedUser(viewer.user);
  const nsfwEnabled = await readAccountNsfwEnabled(viewer.user.id);
  const hasPaidNsfwPlan = hasNsfwSubscription(viewer);
  // Character/profile SFW-only forces the checker on.
  const contentIsNsfw = opts?.characterNsfw === true || opts?.requestNsfw === true;

  if (!isAdultVerified) {
    return { enableSafetyChecker: true, reason: 'adult_unverified', isAdultVerified, nsfwEnabled, hasPaidNsfwPlan };
  }
  if (!hasPaidNsfwPlan) {
    return { enableSafetyChecker: true, reason: 'plan_sfw', isAdultVerified, nsfwEnabled, hasPaidNsfwPlan };
  }
  if (!nsfwEnabled) {
    return { enableSafetyChecker: true, reason: 'profile_sfw', isAdultVerified, nsfwEnabled, hasPaidNsfwPlan };
  }
  if (!contentIsNsfw) {
    return { enableSafetyChecker: true, reason: 'content_sfw', isAdultVerified, nsfwEnabled, hasPaidNsfwPlan };
  }
  return { enableSafetyChecker: false, reason: 'nsfw_authorized', isAdultVerified, nsfwEnabled, hasPaidNsfwPlan };
}

/** NSFW text/image generation requires adult verification + Premium/Ultimate (admins exempt). */
export async function assertNsfwAccess(viewer: Viewer): Promise<Response | null> {
  if (viewer.isAdmin || viewer.isCreatorAdmin) return null;
  if (!isAdultVerifiedUser(viewer.user)) {
    return Response.json({
      error: 'Confirm you are 18+ (Terms of Service / age gate) before using adult content.',
      code: 'ADULT_VERIFICATION_REQUIRED',
    }, { status: 403 });
  }
  if (!hasNsfwSubscription(viewer)) {
    return Response.json({
      error: '18+ NSFW content unlocks with Premium or Ultimate.',
      code: 'NSFW_LOCKED',
      feature: 'nsfw',
    }, { status: 403 });
  }
  if (!(await readAccountNsfwEnabled(viewer.user.id))) {
    return Response.json({
      error: 'Turn on NSFW content in your profile settings to continue.',
      code: 'NSFW_DISABLED',
      feature: 'nsfw',
    }, { status: 403 });
  }
  return null;
}

const MINOR_RE = /\b(child|children|minor|minors|underage|preteen|pre-teen|toddler|infant|baby|babies|loli|lolita|shota|pedo|paedo|jailbait|young\s*girl|young\s*boy|schoolgirl|schoolboy)\b/i;
const AGE_RE = /\b([1-9]|1[0-7])\s*(?:years?\s*old|yo|y\/o|yrs?)\b/i;
const NCII_RE = /\b(non[-\s]?consensual|without\s+consent|forced\s+sex|rape|raping|drugged|unconscious\s+sex|revenge\s*porn|ncii|deepfake\s+porn)\b/i;
const REAL_PERSON_RE = /\b(real\s+person|real\s+celebrity|looks?\s+like\s+[A-Z][a-z]+|deepfake|deep\s*fake|photo\s+of\s+[A-Z][a-z]+\s+[A-Z][a-z]+|celebrity\s+likeness|famous\s+actor|politician\s+nude)\b/i;
const GORE_RE = /\b(extreme\s+gore|snuff|dismember|decapitat|torture\s+porn|guro)\b/i;
const ILLEGAL_RE = /\b(bestiality|zoophilia|necrophilia|incest\s+with\s+minor|child\s*porn|csam|cp\b)\b/i;

export type ModerationCategory =
  | 'minors'
  | 'non_consensual'
  | 'real_person'
  | 'extreme_violence'
  | 'illegal';

export interface ModerationResult {
  allowed: boolean;
  category?: ModerationCategory;
  matched?: string;
  message?: string;
}

const POLICY_NOTICE =
  'This request was blocked by Nexus Trust & Safety policy. Prompts may not involve minors, non-consensual sexual content, real-person likenesses/deepfakes, extreme gore, or illegal acts.';

/** Server-side hard blocklist before LLM prompt translation or fal.ai. */
export function moderateGenerationText(...parts: Array<string | null | undefined>): ModerationResult {
  const text = parts.map((p) => htmlToPlainText(p || '')).join('\n').trim();
  if (!text) return { allowed: true };

  const checks: Array<{ category: ModerationCategory; re: RegExp }> = [
    { category: 'minors', re: MINOR_RE },
    { category: 'minors', re: AGE_RE },
    { category: 'non_consensual', re: NCII_RE },
    { category: 'real_person', re: REAL_PERSON_RE },
    { category: 'extreme_violence', re: GORE_RE },
    { category: 'illegal', re: ILLEGAL_RE },
  ];

  for (const check of checks) {
    const match = text.match(check.re);
    if (match) {
      return {
        allowed: false,
        category: check.category,
        matched: match[0].slice(0, 40),
        message: POLICY_NOTICE,
      };
    }
  }
  return { allowed: true };
}

export function moderationBlockedResponse(result: ModerationResult): Response {
  return Response.json({
    error: result.message || POLICY_NOTICE,
    code: 'CONTENT_POLICY_VIOLATION',
    category: result.category,
  }, { status: 400 });
}

let tablesReady: Promise<void> | null = null;

async function ensureTrustTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await ensureGenerationLimitTables().catch(() => {});
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS public.moderation_flags (
          id bigserial PRIMARY KEY,
          user_id_hash text NOT NULL,
          route text NOT NULL DEFAULT '',
          category text NOT NULL,
          matched text NOT NULL DEFAULT '',
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS public.image_generation_logs (
          id bigserial PRIMARY KEY,
          user_id_hash text NOT NULL,
          character_id text,
          nsfw_flag boolean NOT NULL DEFAULT false,
          fal_request_id text,
          model text,
          safety_checker boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS moderation_flags_hash_idx ON public.moderation_flags (user_id_hash, created_at DESC);
        CREATE INDEX IF NOT EXISTS image_generation_logs_hash_idx ON public.image_generation_logs (user_id_hash, created_at DESC);
      `);
    })().catch((err) => {
      tablesReady = null;
      throw err;
    });
  }
  await tablesReady;
}

/** Log a blocked attempt with hashed user id only (no raw UUID in the flags table). */
export async function logModerationFlag(opts: {
  userId: string;
  route: string;
  category: ModerationCategory;
  matched?: string;
}): Promise<void> {
  try {
    await ensureTrustTables();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.moderation_flags (user_id_hash, route, category, matched)
       VALUES ($1, $2, $3, $4)`,
      hashUserId(opts.userId),
      opts.route.slice(0, 120),
      opts.category,
      (opts.matched || '').slice(0, 80),
    );
  } catch (err) {
    console.warn('[trust] moderation_flags insert failed', err instanceof Error ? err.message : err);
  }
}

export async function logImageGeneration(opts: {
  userId: string;
  characterId?: string | null;
  nsfwFlag: boolean;
  falRequestId?: string | null;
  model?: string | null;
  safetyChecker: boolean;
}): Promise<void> {
  try {
    await ensureTrustTables();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.image_generation_logs
         (user_id_hash, character_id, nsfw_flag, fal_request_id, model, safety_checker)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      hashUserId(opts.userId),
      opts.characterId ?? null,
      opts.nsfwFlag,
      opts.falRequestId ?? null,
      opts.model ?? null,
      opts.safetyChecker,
    );
  } catch (err) {
    console.warn('[trust] image_generation_logs insert failed', err instanceof Error ? err.message : err);
  }
}

/** Persist 18+ verification from the age gate / TOS onto the user row (server source of truth). */
export async function markAdultVerified(userId: string): Promise<void> {
  const now = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: { termsAccepted: true, termsAcceptedAt: now },
  }).catch(async () => {
    await prisma.$executeRawUnsafe(
      `UPDATE nexus."User"
       SET "termsAccepted" = true,
           "termsAcceptedAt" = COALESCE("termsAcceptedAt", $2)
       WHERE id = $1`,
      userId,
      now,
    );
  });
}
