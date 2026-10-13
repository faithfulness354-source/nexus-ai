import { prisma } from '@/lib/db';
import { TIERS, PAID_TIERS, type PaidTierId } from '@/lib/tiers';

/** PayPal REST credentials: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE=live, PAYPAL_WEBHOOK_ID. */
export function paypalConfigured(): boolean {
  return !!paypalEnv('PAYPAL_CLIENT_ID') && !!paypalEnv('PAYPAL_CLIENT_SECRET');
}

const LIVE_API = 'https://api-m.paypal.com';
const SANDBOX_API = 'https://api-m.sandbox.paypal.com';

function paypalEnv(name: string): string {
  return (process.env[name] ?? '').trim().replace(/^['"]+|['"]+$/g, '').trim();
}

const apiBase = () => (paypalEnv('PAYPAL_MODE').toLowerCase() === 'live' ? LIVE_API : SANDBOX_API);

let token: { value: string; expires: number; base: string } | null = null;

async function accessToken(): Promise<string> {
  const clientId = paypalEnv('PAYPAL_CLIENT_ID');
  const clientSecret = paypalEnv('PAYPAL_CLIENT_SECRET');
  const base = apiBase();
  if (token && token.base === base && token.expires > Date.now() + 60_000) return token.value;
  const basic = Buffer.from(`${clientId.trim()}:${clientSecret.trim()}`).toString('base64');
  const endpoint = `${base}/v1/oauth2/token`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    console.error('[paypal] oauth failed', { endpoint, status: res.status, body: data });
    throw new Error(`PayPal auth failed (${res.status}): ${data.error_description ?? data.error ?? ''}`);
  }
  token = { value: data.access_token, expires: Date.now() + (data.expires_in ?? 3000) * 1000, base };
  return token.value;
}

/** Authenticated PayPal REST call. Throws with PayPal's error message on failure. */
export async function paypal<T = any>(path: string, init: { method?: string; body?: unknown; requestId?: string } = {}): Promise<T> {
  const endpoint = `${apiBase()}${path}`;
  const res = await fetch(endpoint, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.requestId ? { 'PayPal-Request-Id': init.requestId } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 204) return {} as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[paypal] request failed', { endpoint, status: res.status, body: data });
    throw new Error(`PayPal ${path} failed (${res.status}): ${data.message ?? data.name ?? ''} ${JSON.stringify(data.details ?? '')}`);
  }
  return data as T;
}

export const priceCents = (tier: PaidTierId) => Math.round(TIERS[tier].price * 100);
const planCache = new Map<PaidTierId, string>();

/**
 * Finds (or creates) the monthly PayPal billing plan for a tier at the CURRENT price.
 * The mapping is saved in SubscriptionPlan; a price change creates a new plan, existing
 * subscribers stay on their old plan until they switch.
 */
export async function getPlanId(tier: PaidTierId): Promise<string> {
  const envId = process.env[`PAYPAL_PLAN_${tier}`]?.trim();
  if (envId) return envId;
  const cached = planCache.get(tier);
  if (cached) return cached;

  const cents = priceCents(tier);
  const def = TIERS[tier];
  const row = await prisma.subscriptionPlan.findUnique({ where: { tier } });
  if (row?.paypalPlanId && row.priceCents === cents) {
    planCache.set(tier, row.paypalPlanId);
    return row.paypalPlanId;
  }

  const product = await paypal<{ id: string }>('/v1/catalogs/products', {
    method: 'POST',
    requestId: `nexus-product-${tier}-v1`,
    body: { name: `NexusAI ${def.name}`, description: def.features.join(' · ').slice(0, 250), type: 'SERVICE', category: 'SOFTWARE' },
  });
  const plan = await paypal<{ id: string }>('/v1/billing/plans', {
    method: 'POST',
    requestId: `nexus-plan-${tier}-${cents}`,
    body: {
      product_id: product.id,
      name: `NexusAI ${def.name} (monthly)`,
      description: `${def.name} plan, $${def.price.toFixed(2)}/month`,
      status: 'ACTIVE',
      billing_cycles: [{
        frequency: { interval_unit: 'MONTH', interval_count: 1 },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: { fixed_price: { value: (cents / 100).toFixed(2), currency_code: 'USD' } },
      }],
      payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 2 },
    },
  });
  const data = { name: def.name, priceCents: cents, paypalPlanId: plan.id };
  await prisma.subscriptionPlan.upsert({ where: { tier }, update: data, create: { tier, ...data } });
  planCache.set(tier, plan.id);
  return plan.id;
}

async function tierFromPlan(planId?: string | null): Promise<PaidTierId | null> {
  if (!planId) return null;
  for (const t of PAID_TIERS) if (process.env[`PAYPAL_PLAN_${t}`]?.trim() === planId) return t;
  const row = await prisma.subscriptionPlan.findFirst({ where: { paypalPlanId: planId } });
  return row && row.tier !== 'FREE' ? (row.tier as PaidTierId) : null;
}

export interface PaypalSubscription {
  id: string;
  status: 'APPROVAL_PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
  plan_id: string;
  custom_id?: string;
  billing_info?: { next_billing_time?: string; last_payment?: { time?: string } };
  links?: { href: string; rel: string }[];
}

/**
 * Writes a PayPal subscription's tier/status onto its user (custom_id = userId).
 * Cancelled subscriptions keep access until the paid period ends (status 'canceling').
 */
export async function syncPaypalSubscription(sub: PaypalSubscription): Promise<void> {
  const user = sub.custom_id
    ? await prisma.user.findUnique({ where: { id: sub.custom_id } })
    : await prisma.user.findFirst({ where: { paypalSubscriptionId: sub.id } });
  if (!user) {
    console.warn('PayPal sync: no user for subscription', sub.id);
    return;
  }
  const isCurrent = !user.paypalSubscriptionId || user.paypalSubscriptionId === sub.id;
  if (!isCurrent && sub.status !== 'ACTIVE') return; // ignore events from an older subscription

  const tier = await tierFromPlan(sub.plan_id);
  const next = sub.billing_info?.next_billing_time ? new Date(sub.billing_info.next_billing_time) : null;
  let status: string;
  let periodEnd: Date | null = next;
  switch (sub.status) {
    case 'ACTIVE': status = 'active'; break;
    case 'SUSPENDED': status = 'past_due'; break;
    case 'CANCELLED': {
      // Keep the current paid period; PayPal clears next_billing_time once cancelled.
      periodEnd = user.currentPeriodEnd && user.currentPeriodEnd > new Date() ? user.currentPeriodEnd : null;
      status = periodEnd ? 'canceling' : 'canceled';
      break;
    }
    case 'EXPIRED': status = 'canceled'; periodEnd = null; break;
    default: status = 'pending';
  }
  if (status === 'pending' && user.paypalSubscriptionId && user.paypalSubscriptionId !== sub.id) return;
  const ended = status === 'canceled';

  await prisma.user.update({
    where: { id: user.id },
    data: {
      paypalSubscriptionId: ended ? null : sub.id,
      subscriptionStatus: status,
      tier: ended || !tier ? (status === 'pending' ? user.tier : 'FREE') : tier,
      currentPeriodEnd: ended ? null : periodEnd,
    },
  });
}

/** Verifies a webhook through PayPal's verify-webhook-signature endpoint. */
export async function verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) return false;
  const h = (n: string) => headers.get(n) ?? '';
  const res = await paypal<{ verification_status: string }>('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: {
      auth_algo: h('paypal-auth-algo'),
      cert_url: h('paypal-cert-url'),
      transmission_id: h('paypal-transmission-id'),
      transmission_sig: h('paypal-transmission-sig'),
      transmission_time: h('paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: event,
    },
  });
  return res.verification_status === 'SUCCESS';
}
