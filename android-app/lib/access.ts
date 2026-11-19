import { prisma } from '@/lib/db';
import { auth } from '@/auth';
import { isWhitelistedEmail } from '@/lib/admin';
import { hasAdminRole } from '@/lib/admin-role';
import {
  subscribeStarPaymentsReady,
  subscribeStarProfileUrl,
} from '@/lib/subscribestar';
import { ensureCreditRpcs } from '@/lib/ensure-credit-rpc';
import { TIERS, type AccessStatus, type TierFeature, type TierId } from '@/lib/tiers';
import type { User } from '@prisma/client';

// HARD GUARD: NEVER MODIFY OR STRIP IS_ADMIN PERMISSION CHECKS
export function isAdminUser(user: Pick<User, 'role' | 'isWhitelisted' | 'email'>): boolean {
  return user.role === 'CREATOR_ADMIN' || user.isWhitelisted || isWhitelistedEmail(user.email) || hasAdminRole(user.role, user.isWhitelisted);
}

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

/** Effective tier: paid tiers count while the SubscribeStar subscription is active, or cancelled but still inside the paid period. */
export function effectiveTier(user: Pick<User, 'tier' | 'subscriptionStatus' | 'currentPeriodEnd'>): TierId {
  if (user.tier === 'FREE') return 'FREE';
  if (ACTIVE_STATUSES.has(user.subscriptionStatus ?? '')) return user.tier as TierId;
  if (user.subscriptionStatus === 'canceling' && user.currentPeriodEnd && user.currentPeriodEnd > new Date()) return user.tier as TierId;
  return 'FREE';
}

export function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function nextUtcMidnight(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

/** API keys and provider proxies belong only to the whitelisted creator account. */
export function isCreatorAdminUser(user: Pick<User, 'role' | 'email'>): boolean {
  return user.role === 'CREATOR_ADMIN' && isWhitelistedEmail(user.email);
}

export interface Viewer {
  user: User;
  isAdmin: boolean;
  /** Whitelisted account whose role is CREATOR_ADMIN. Gates API provider settings. */
  isCreatorAdmin: boolean;
  tier: TierId;
}

/** Loads the signed-in user from the DB, or null when signed out. Never trusts client-reported tier. */
export async function getViewer(): Promise<Viewer | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  let user = await prisma.user.findUnique({ where: { id } });
  if (!user) return null;
  // The creator whitelist keeps Ultimate access even if the role was cleared.
  if (isWhitelistedEmail(user.email) && (user.role !== 'CREATOR_ADMIN' || !user.isWhitelisted)) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'CREATOR_ADMIN', isWhitelisted: true },
    });
  }
  const isAdmin = isAdminUser(user);
  // Whitelisted creator admins get Ultimate features automatically, without any billing.
  return { user, isAdmin, isCreatorAdmin: isCreatorAdminUser(user), tier: isAdmin ? 'ULTIMATE' : effectiveTier(user) };
}

/** Signed-in creator, or the error Response. Required before any provider key or proxy is read or written. */
export async function requireCreatorAdmin(): Promise<Viewer | Response> {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  if (!viewer.isCreatorAdmin) return forbidden('Only the site creator can manage API settings.');
  return viewer;
}

export function can(viewer: Viewer, feature: TierFeature): boolean {
  return viewer.isAdmin || TIERS[viewer.tier][feature];
}

/** Server-side daily text credit limit for this viewer (Ultimate soft fair-use included). */
export function textCreditLimit(viewer: Viewer): number | null {
  if (viewer.isAdmin) return null;
  return TIERS[viewer.tier].dailyCredits;
}

export function contextBudget(viewer: Viewer, modelWindow: number): number {
  return viewer.isAdmin ? modelWindow : Math.min(modelWindow, TIERS[viewer.tier].contextTokens);
}

export function paymentsConfigured(): boolean {
  // Outbound SubscribeStar links work whenever the public profile URL is set.
  // OAuth/webhook secrets may still be placeholders during platform review.
  return subscribeStarPaymentsReady();
}

export function accessStatus(viewer: Viewer | null): AccessStatus {
  const tier = viewer?.tier ?? 'FREE';
  const plan = TIERS[tier];
  // Silent fair-use (Ultimate) and admins report unlimited text credits in the UI.
  const daily = viewer?.isAdmin || plan.fairUseSilent ? null : plan.dailyCredits;
  const used = viewer && viewer.user.creditsDay === utcDay() ? viewer.user.creditsUsed : 0;
  const imgDaily = viewer?.isAdmin ? null : plan.dailyImageCredits;
  const imgUsed = viewer && viewer.user.imageCreditsDay === utcDay() ? viewer.user.imageCreditsUsed : 0;
  return {
    authenticated: !!viewer,
    userId: viewer?.user.id ?? null,
    username: viewer?.user.username ?? null,
    isAdmin: !!viewer?.isAdmin,
    isCreatorAdmin: !!viewer?.isCreatorAdmin,
    avatarUrl: viewer?.user.image?.trim() || null,
    tier,
    dailyCredits: daily,
    creditsUsed: daily === null ? 0 : used,
    creditsRemaining: daily === null ? null : Math.max(0, daily - used),
    dailyImageCredits: imgDaily,
    imageCreditsUsed: imgUsed,
    imageCreditsRemaining: imgDaily === null ? null : Math.max(0, imgDaily - imgUsed),
    contextTokens: viewer?.isAdmin ? null : plan.contextTokens,
    resetsAt: nextUtcMidnight(),
    subscriptionStatus: viewer?.user.subscriptionStatus ?? null,
    currentPeriodEnd: viewer?.user.currentPeriodEnd?.toISOString() ?? null,
    hasSubscription: !!(viewer as any)?.user?.subscribeStarId && ['active', 'past_due', 'canceling'].includes((viewer?.user.subscriptionStatus) ?? ''),
    paymentsConfigured: paymentsConfigured(),
    subscribeStarProfileUrl: subscribeStarProfileUrl(),
    subscribeStarLinked: !!(viewer as any)?.user?.subscribeStarId,
    subscribeStarUsername: ((viewer as any)?.user?.subscribeStarUsername as string | null | undefined) ?? null,
    nsfwEnabled: false,
    can: {
      customPrompts: !!viewer && can(viewer, 'customPrompts'),
      advancedGeneration: !!viewer && can(viewer, 'advancedGeneration'),
      proModels: !!viewer && can(viewer, 'proModels'),
      sceneImages: !!viewer && can(viewer, 'sceneImages'),
      vipThemes: !!viewer && can(viewer, 'vipThemes'),
      nsfw: canViewNsfw(viewer),
    },
  };
}

async function consumeTextViaRpc(userId: string, day: string, limit: number | null): Promise<boolean | null> {
  try {
    await ensureCreditRpcs();
    const rows = await prisma.$queryRawUnsafe<Array<{ nexus: boolean } | { consume_daily_credit: boolean }>>(
      `SELECT nexus.consume_daily_credit($1, $2, $3) AS ok`,
      userId,
      day,
      limit,
    );
    const row = rows[0] as { ok?: boolean } | undefined;
    if (typeof row?.ok === 'boolean') return row.ok;
    return null;
  } catch (err) {
    console.warn('[credits] RPC consume failed, falling back to Prisma', err instanceof Error ? err.message : err);
    return null;
  }
}

async function refundTextViaRpc(userId: string, day: string): Promise<boolean> {
  try {
    await ensureCreditRpcs();
    await prisma.$executeRawUnsafe(`SELECT nexus.refund_daily_credit($1, $2)`, userId, day);
    return true;
  } catch (err) {
    console.warn('[credits] RPC refund failed, falling back to Prisma', err instanceof Error ? err.message : err);
    return false;
  }
}

async function consumeImageViaRpc(userId: string, day: string, limit: number): Promise<boolean | null> {
  try {
    await ensureCreditRpcs();
    const rows = await prisma.$queryRawUnsafe<Array<{ ok: boolean }>>(
      `SELECT nexus.consume_image_credit($1, $2, $3) AS ok`,
      userId,
      day,
      limit,
    );
    if (typeof rows[0]?.ok === 'boolean') return rows[0].ok;
    return null;
  } catch (err) {
    console.warn('[credits] image RPC consume failed, falling back to Prisma', err instanceof Error ? err.message : err);
    return null;
  }
}

async function refundImageViaRpc(userId: string, day: string): Promise<boolean> {
  try {
    await ensureCreditRpcs();
    await prisma.$executeRawUnsafe(`SELECT nexus.refund_image_credit($1, $2)`, userId, day);
    return true;
  } catch (err) {
    console.warn('[credits] image RPC refund failed, falling back to Prisma', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Atomically consumes one text credit for today (1 credit = 1 message).
 * Admins bypass. Ultimate uses a silent soft fair-use cap of 10,000/day.
 * Prefers the Supabase/Postgres RPC; falls back to conditional updateMany.
 */
export async function consumeCredit(viewer: Viewer): Promise<boolean> {
  if (viewer.isAdmin) return true;
  const limit = textCreditLimit(viewer);
  const today = utcDay();
  const id = viewer.user.id;

  const viaRpc = await consumeTextViaRpc(id, today, limit);
  if (viaRpc !== null) return viaRpc;

  const reset = await prisma.user.updateMany({ where: { id, creditsDay: { not: today } }, data: { creditsDay: today, creditsUsed: 1 } });
  if (reset.count > 0) return true;
  if (limit === null) {
    await prisma.user.update({ where: { id }, data: { creditsUsed: { increment: 1 } } });
    return true;
  }
  const inc = await prisma.user.updateMany({ where: { id, creditsDay: today, creditsUsed: { lt: limit } }, data: { creditsUsed: { increment: 1 } } });
  return inc.count > 0;
}

/** Gives back a credit when generation failed before producing a usable reply. */
export async function refundCredit(viewer: Viewer): Promise<void> {
  if (viewer.isAdmin) return;
  const today = utcDay();
  if (await refundTextViaRpc(viewer.user.id, today)) return;
  await prisma.user.updateMany({ where: { id: viewer.user.id, creditsDay: today, creditsUsed: { gt: 0 } }, data: { creditsUsed: { decrement: 1 } } });
}

/**
 * Atomically consumes one image/scene credit for today (Ultimate: 100/day hard cap).
 * Admins always succeed. Returns false when the tier has no image allowance or it is used up.
 */
export async function consumeImageCredit(viewer: Viewer): Promise<boolean> {
  if (viewer.isAdmin) return true;
  const limit = TIERS[viewer.tier].dailyImageCredits;
  if (limit <= 0) return false;
  const today = utcDay();
  const id = viewer.user.id;

  const viaRpc = await consumeImageViaRpc(id, today, limit);
  if (viaRpc !== null) return viaRpc;

  const reset = await prisma.user.updateMany({ where: { id, imageCreditsDay: { not: today } }, data: { imageCreditsDay: today, imageCreditsUsed: 1 } });
  if (reset.count > 0) return true;
  const inc = await prisma.user.updateMany({ where: { id, imageCreditsDay: today, imageCreditsUsed: { lt: limit } }, data: { imageCreditsUsed: { increment: 1 } } });
  return inc.count > 0;
}

export async function refundImageCredit(viewer: Viewer): Promise<void> {
  if (viewer.isAdmin) return;
  const today = utcDay();
  if (await refundImageViaRpc(viewer.user.id, today)) return;
  await prisma.user.updateMany({ where: { id: viewer.user.id, imageCreditsDay: today, imageCreditsUsed: { gt: 0 } }, data: { imageCreditsUsed: { decrement: 1 } } });
}

/** A chat session is accessible to its owner; legacy chats without an owner only to admins. */
export function canAccessSession(viewer: Viewer, session: { userId: string | null }): boolean {
  return session.userId ? session.userId === viewer.user.id || viewer.isAdmin : viewer.isAdmin;
}

/** The card's author, or an admin account, which can edit every card including private drafts. */
export function canEditCharacter(viewer: Viewer, character: { ownerId: string | null }): boolean {
  // HARD GUARD: NEVER MODIFY OR STRIP IS_ADMIN PERMISSION CHECKS
  return viewer.isAdmin || viewer.isCreatorAdmin || (!!character.ownerId && character.ownerId === viewer.user.id);
}

/** 18+ NSFW content requires an active Premium/Ultimate subscription or a whitelisted creator admin. */
export function canViewNsfw(viewer: Viewer | null): boolean {
  return !!viewer && can(viewer, 'nsfw');
}

/**
 * Profile NSFW switch. Creator and admin accounts save the preference without a paid plan.
 * Other accounts need Premium, the tier that unlocks adult cards.
 */
export function canToggleNsfw(viewer: Viewer | null): boolean {
  if (!viewer) return false;
  if (viewer.isAdmin || viewer.isCreatorAdmin) return true;
  return can(viewer, 'nsfw');
}

export const NSFW_UPGRADE_MESSAGE = '18+ NSFW content and scenarios unlock with the Premium or Ultimate plan. Please upgrade your subscription to unlock.';

export const json = (body: unknown, status = 200) => Response.json(body, { status });
export const nsfwLocked = () => json({ error: NSFW_UPGRADE_MESSAGE, code: 'NSFW_LOCKED', feature: 'nsfw' }, 403);
export const unauthorized = () => json({ error: 'Please sign in to continue.', code: 'UNAUTHENTICATED' }, 401);
export const forbidden = (msg = 'Not allowed') => json({ error: msg, code: 'FORBIDDEN' }, 403);

/** 402 Payment Required — feature needs a higher plan. */
export function upgradeRequired(feature: TierFeature, message: string) {
  return json({ error: message, code: 'UPGRADE_REQUIRED', feature }, 402);
}

/** 429 Too Many Requests — daily credit / fair-use cap reached (resets at next UTC midnight). */
export function dailyLimitReached(kind: 'credits' | 'imageCredits', message: string, tier: TierId) {
  return json({
    error: message,
    code: kind === 'credits' ? 'OUT_OF_CREDITS' : 'OUT_OF_IMAGE_CREDITS',
    feature: kind === 'imageCredits' ? 'sceneImages' : undefined,
    tier,
    resetsAt: nextUtcMidnight(),
  }, 429);
}

/** Signed-in viewer who may access chat `sessionId`, or the error Response to return. */
export async function requireSessionAccess(sessionId: string): Promise<Viewer | Response> {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  const s = await prisma.chatSession.findUnique({ where: { id: sessionId }, select: { userId: true } });
  if (!s) return json({ error: 'Not found' }, 404);
  if (!canAccessSession(viewer, s)) return forbidden('This chat belongs to another account.');
  return viewer;
}
