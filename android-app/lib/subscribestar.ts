import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/db';
import { isTierId, type TierId } from '@/lib/tiers';

/**
 * SubscribeStar webhook sync.
 * Env:
 *   SUBSCRIBESTAR_WEBHOOK_SECRET — HMAC secret for X-SubscribeStar-Signature (hex sha256)
 *   SUBSCRIBESTAR_PLUS_TIER_IDS / PREMIUM / ULTIMATE — comma-separated external plan ids (optional)
 */

export function subscribeStarConfigured(): boolean {
  return !!process.env.SUBSCRIBESTAR_WEBHOOK_SECRET?.trim();
}

export function verifySubscribeStarSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.SUBSCRIBESTAR_WEBHOOK_SECRET?.trim();
  if (!secret || !signatureHeader) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const provided = signatureHeader.replace(/^sha256=/i, '').trim();
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function planTier(): Array<{ tier: TierId; ids: Set<string> }> {
  const read = (env: string, tier: TierId) => ({
    tier,
    ids: new Set((process.env[env] ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)),
  });
  return [
    read('SUBSCRIBESTAR_ULTIMATE_TIER_IDS', 'ULTIMATE'),
    read('SUBSCRIBESTAR_PREMIUM_TIER_IDS', 'PREMIUM'),
    read('SUBSCRIBESTAR_PLUS_TIER_IDS', 'PLUS'),
  ];
}

export function tierFromSubscribeStarPlan(planId: string | null | undefined): TierId | null {
  if (!planId) return null;
  const key = planId.trim().toLowerCase();
  if (isTierId(planId.toUpperCase())) return planId.toUpperCase() as TierId;
  for (const row of planTier()) {
    if (row.ids.has(key)) return row.tier;
  }
  // Common name fallbacks when env plan ids are not configured.
  if (/ultimate|patron.?iv|vip/i.test(planId)) return 'ULTIMATE';
  if (/premium|patron.?iii/i.test(planId)) return 'PREMIUM';
  if (/plus|patron.?ii|basic/i.test(planId)) return 'PLUS';
  return null;
}

export interface SubscribeStarEvent {
  id?: string;
  type?: string;
  email?: string;
  user_id?: string | number;
  plan_id?: string;
  plan?: string | { id?: string; name?: string };
  status?: string;
  current_period_end?: string;
  data?: Record<string, unknown>;
}

function nested(event: SubscribeStarEvent, key: string): unknown {
  return event[key as keyof SubscribeStarEvent] ?? event.data?.[key];
}

/**
 * Applies a SubscribeStar subscription lifecycle event onto the matching Nexus user (by email).
 * Active/trialing → grant mapped tier. Cancelled/expired/lapsed → FREE (or canceling until period end).
 */
export async function syncSubscribeStarEvent(event: SubscribeStarEvent): Promise<{ ok: boolean; reason?: string }> {
  const emailRaw = String(nested(event, 'email') ?? '').trim().toLowerCase();
  if (!emailRaw) return { ok: false, reason: 'missing_email' };

  const user = await prisma.user.findUnique({ where: { email: emailRaw } });
  if (!user) return { ok: false, reason: 'user_not_found' };

  const planId = String(
    nested(event, 'plan_id')
    ?? (typeof event.plan === 'string' ? event.plan : event.plan?.id ?? event.plan?.name)
    ?? nested(event, 'tier')
    ?? '',
  ).trim();
  const statusRaw = String(nested(event, 'status') ?? event.type ?? '').toLowerCase();
  const periodEndRaw = nested(event, 'current_period_end');
  const periodEnd = typeof periodEndRaw === 'string' && periodEndRaw ? new Date(periodEndRaw) : null;

  const active = /active|trial|subscribed|created|renewed|payment_succeeded/.test(statusRaw);
  const canceled = /cancel|expire|lapsed|unsubscribed|deleted|refunded|payment_failed/.test(statusRaw);

  if (active) {
    const tier = tierFromSubscribeStarPlan(planId) ?? (isTierId(user.tier) && user.tier !== 'FREE' ? user.tier : 'PLUS');
    await prisma.user.update({
      where: { id: user.id },
      data: {
        tier,
        subscriptionStatus: 'active',
        currentPeriodEnd: periodEnd && !Number.isNaN(periodEnd.getTime()) ? periodEnd : user.currentPeriodEnd,
      },
    });
    return { ok: true };
  }

  if (canceled) {
    const keepUntil = periodEnd && periodEnd > new Date()
      ? periodEnd
      : (user.currentPeriodEnd && user.currentPeriodEnd > new Date() ? user.currentPeriodEnd : null);
    await prisma.user.update({
      where: { id: user.id },
      data: keepUntil
        ? { subscriptionStatus: 'canceling', currentPeriodEnd: keepUntil }
        : { tier: 'FREE', subscriptionStatus: 'canceled', currentPeriodEnd: null },
    });
    return { ok: true };
  }

  return { ok: false, reason: 'unhandled_status' };
}
