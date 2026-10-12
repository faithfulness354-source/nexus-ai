import { prisma } from '@/lib/db';
import { auth } from '@/auth';
import { isWhitelistedEmail } from '@/lib/admin';
import { TIERS, type AccessStatus, type TierFeature, type TierId } from '@/lib/tiers';
import type { User } from '@prisma/client';

export function isAdminUser(user: Pick<User, 'role' | 'isWhitelisted' | 'email'>): boolean {
  return user.role === 'CREATOR_ADMIN' || user.isWhitelisted || isWhitelistedEmail(user.email);
}

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

/** Effective tier: paid tiers count while the PayPal subscription is active, or cancelled but still inside the paid period. */
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

/** Loads the signed-in user from the DB, or null when signed out. */
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

export function contextBudget(viewer: Viewer, modelWindow: number): number {
  return viewer.isAdmin ? modelWindow : Math.min(modelWindow, TIERS[viewer.tier].contextTokens);
}

export function paymentsConfigured(): boolean {
  return !!process.env.PAYPAL_CLIENT_ID?.trim() && !!process.env.PAYPAL_CLIENT_SECRET?.trim();
}

export function accessStatus(viewer: Viewer | null): AccessStatus {
  const tier = viewer?.tier ?? 'FREE';
  const daily = viewer?.isAdmin ? null : TIERS[tier].dailyCredits;
  const used = viewer && viewer.user.creditsDay === utcDay() ? viewer.user.creditsUsed : 0;
  const imgDaily = viewer?.isAdmin ? null : TIERS[tier].dailyImageCredits;
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
    creditsUsed: used,
    creditsRemaining: daily === null ? null : Math.max(0, daily - used),
    dailyImageCredits: imgDaily,
    imageCreditsUsed: imgUsed,
    imageCreditsRemaining: imgDaily === null ? null : Math.max(0, imgDaily - imgUsed),
    contextTokens: viewer?.isAdmin ? null : TIERS[tier].contextTokens,
    resetsAt: nextUtcMidnight(),
    subscriptionStatus: viewer?.user.subscriptionStatus ?? null,
    currentPeriodEnd: viewer?.user.currentPeriodEnd?.toISOString() ?? null,
    hasSubscription: !!viewer?.user.paypalSubscriptionId && ['active', 'past_due'].includes(viewer.user.subscriptionStatus ?? ''),
    paymentsConfigured: paymentsConfigured(),
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

/**
 * Atomically consumes one credit for today. Admins and unlimited tiers always succeed.
 * Returns false when the daily allowance is used up.
 */
export async function consumeCredit(viewer: Viewer): Promise<boolean> {
  if (viewer.isAdmin) return true;
  const limit = TIERS[viewer.tier].dailyCredits;
  const today = utcDay();
  const id = viewer.user.id;
  // New day: reset the counter to 1 (only if it hasn't been reset concurrently).
  const reset = await prisma.user.updateMany({ where: { id, creditsDay: { not: today } }, data: { creditsDay: today, creditsUsed: 1 } });
  if (reset.count > 0) return true;
  if (limit === null) {
    await prisma.user.update({ where: { id }, data: { creditsUsed: { increment: 1 } } });
    return true;
  }
  const inc = await prisma.user.updateMany({ where: { id, creditsDay: today, creditsUsed: { lt: limit } }, data: { creditsUsed: { increment: 1 } } });
  return inc.count > 0;
}

/** Gives back a credit when generation failed before producing anything. */
export async function refundCredit(viewer: Viewer): Promise<void> {
  if (viewer.isAdmin) return;
  await prisma.user.updateMany({ where: { id: viewer.user.id, creditsDay: utcDay(), creditsUsed: { gt: 0 } }, data: { creditsUsed: { decrement: 1 } } });
}

/**
 * Atomically consumes one image/scene credit for today (Ultimate: 100/day). Admins always succeed.
 * Returns false when the tier has no image allowance or it is used up.
 */
export async function consumeImageCredit(viewer: Viewer): Promise<boolean> {
  if (viewer.isAdmin) return true;
  const limit = TIERS[viewer.tier].dailyImageCredits;
  if (limit <= 0) return false;
  const today = utcDay();
  const id = viewer.user.id;
  const reset = await prisma.user.updateMany({ where: { id, imageCreditsDay: { not: today } }, data: { imageCreditsDay: today, imageCreditsUsed: 1 } });
  if (reset.count > 0) return true;
  const inc = await prisma.user.updateMany({ where: { id, imageCreditsDay: today, imageCreditsUsed: { lt: limit } }, data: { imageCreditsUsed: { increment: 1 } } });
  return inc.count > 0;
}

export async function refundImageCredit(viewer: Viewer): Promise<void> {
  if (viewer.isAdmin) return;
  await prisma.user.updateMany({ where: { id: viewer.user.id, imageCreditsDay: utcDay(), imageCreditsUsed: { gt: 0 } }, data: { imageCreditsUsed: { decrement: 1 } } });
}

/** A chat session is accessible to its owner; legacy chats without an owner only to admins. */
export function canAccessSession(viewer: Viewer, session: { userId: string | null }): boolean {
  return session.userId ? session.userId === viewer.user.id || viewer.isAdmin : viewer.isAdmin;
}

/** The card's author, or the creator/admin account, which can edit every card including private drafts. */
export function canEditCharacter(viewer: Viewer, character: { ownerId: string | null }): boolean {
  return viewer.isCreatorAdmin || (!!character.ownerId && character.ownerId === viewer.user.id);
}

/** 18+ NSFW content requires an active Premium/Ultimate subscription or a whitelisted creator admin. */
export function canViewNsfw(viewer: Viewer | null): boolean {
  return !!viewer && can(viewer, 'nsfw');
}

export const NSFW_UPGRADE_MESSAGE = '18+ NSFW content and scenarios unlock with the Premium or Ultimate plan. Please upgrade your subscription to unlock.';

export const json = (body: unknown, status = 200) => Response.json(body, { status });
export const nsfwLocked = () => json({ error: NSFW_UPGRADE_MESSAGE, code: 'NSFW_LOCKED' }, 403);
export const unauthorized = () => json({ error: 'Please sign in to continue.', code: 'UNAUTHENTICATED' }, 401);
export const forbidden = (msg = 'Not allowed') => json({ error: msg, code: 'FORBIDDEN' }, 403);

/** Signed-in viewer who may access chat `sessionId`, or the error Response to return. */
export async function requireSessionAccess(sessionId: string): Promise<Viewer | Response> {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  const s = await prisma.chatSession.findUnique({ where: { id: sessionId }, select: { userId: true } });
  if (!s) return json({ error: 'Not found' }, 404);
  if (!canAccessSession(viewer, s)) return forbidden('This chat belongs to another account.');
  return viewer;
}
