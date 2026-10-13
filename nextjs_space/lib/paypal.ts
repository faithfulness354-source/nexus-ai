import 'server-only';
import { prisma } from '@/lib/db';
import { TIERS, PAID_TIERS, type PaidTierId } from '@/lib/tiers';

const LIVE_API = 'https://api-m.paypal.com';

/** Browser and server share the same PayPal app id. The secret stays server-only. */
export function paypalClientId(): string {
  return process.env.PAYPAL_CLIENT_ID?.trim() || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() || '';
}

export function paypalClientSecret(): string {
  return process.env.PAYPAL_CLIENT_SECRET?.trim() || '';
}

let warned = false;

/** Production-only notice. Missing credentials must not throw or fail the build. */
export function warnPaypalConfig(): void {
  const production = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (!production || warned) return;
  const missing = [
    paypalClientId() ? '' : 'PAYPAL_CLIENT_ID',
    paypalClientSecret() ? '' : 'PAYPAL_CLIENT_SECRET',
  ].filter(Boolean);
  if (!missing.length) return;
  warned = true;
  console.warn(`[paypal] Missing ${missing.join(' and ')}. Set them for live checkout.`);
}

/** Live PayPal credentials from PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET. */
export function paypalConfigured(): boolean {
  warnPaypalConfig();
  return !!paypalClientId() && !!paypalClientSecret();
}

/** PAYPAL_MODE=live. Checkout always calls the live PayPal API. */
export function paypalApiBase(): string {
  const mode = (process.env.PAYPAL_MODE || process.env.PAYPAL_ENV || 'live').trim().toLowerCase();
  if (mode !== 'live') return LIVE_API;
  const configured = process.env.PAYPAL_API_BASE_URL?.trim().replace(/\/$/, '');
  if (configured === LIVE_API) return configured;
  return LIVE_API;
}

let token: { value: string; expires: number } | null = null;

function paypalFailure(data: { error?: string; error_description?: string; message?: string; name?: string; details?: { description?: string; issue?: string }[] }, status: number): string {
  const detail = Array.isArray(data?.details) ? data.details.map((item) => item.description || item.issue).filter(Boolean).join('; ') : '';
  return detail || data?.error_description || data?.message || data?.error || data?.name || `PayPal request failed (${status})`;
}

async function accessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim() || paypalClientId();
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim() || paypalClientSecret();
  const mode = (process.env.PAYPAL_MODE || process.env.PAYPAL_ENV || 'live').trim().toLowerCase();
  if (!clientId || !secret) throw new Error('PayPal is not configured');
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const basic = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const res = await fetch(`${mode === 'live' ? LIVE_API : paypalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    console.error('[paypal] oauth /v1/oauth2/token', res.status, data.error || data.name, data.error_description || data.message);
    throw new Error(paypalFailure(data, res.status));
  }
  console.log('[paypal] oauth /v1/oauth2/token', res.status);
  token = { value: data.access_token, expires: Date.now() + (data.expires_in ?? 3000) * 1000 };
  return token.value;
}

/** Authenticated PayPal REST call. Throws with PayPal's error message on failure. */
export async function paypal<T = any>(path: string, init: { method?: string; body?: unknown; requestId?: string } = {}): Promise<T> {
  if (!paypalConfigured()) throw new Error('PayPal is not configured');
  const res = await fetch(`${paypalApiBase()}${path}`, {
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
    console.error('[paypal]', path, res.status, data.name || data.error, data.message || data.error_description, data.details);
    throw new Error(paypalFailure(data, res.status));
  }
  return data as T;
}

export interface PaypalOrder {
  id: string;
  status?: string;
  purchase_units?: { custom_id?: string; amount?: { value?: string } }[];
  links?: { href: string; rel: string }[];
}

/** Creates a live PayPal order and returns the order id. */
export async function createPaypalOrder(input: { value: string; description: string; customId: string; returnUrl: string; cancelUrl: string }): Promise<PaypalOrder> {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim() || '';
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim() || '';
  const mode = (process.env.PAYPAL_MODE || 'live').trim().toLowerCase();
  if (!clientId || !secret) throw new Error('PayPal live credentials are not configured');
  if (mode !== 'live') console.error('[paypal] PAYPAL_MODE is not live; creating the order on https://api-m.paypal.com');
  const order = await paypal<PaypalOrder>('/v2/checkout/orders', {
    method: 'POST',
    body: {
      intent: 'CAPTURE',
      purchase_units: [{
        custom_id: input.customId,
        description: input.description,
        amount: { currency_code: 'USD', value: input.value },
      }],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'NexusAI',
            user_action: 'PAY_NOW',
            shipping_preference: 'NO_SHIPPING',
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
  });
  if (!order?.id) {
    console.error('[paypal] /v2/checkout/orders missing id', order?.status);
    throw new Error('PayPal did not return an order id.');
  }
  console.log('[paypal] /v2/checkout/orders', order.id, order.status);
  return order;
}

/** Captures an approved live order and grants one month of the purchased tier. */
export async function fulfillPaypalOrder(orderId: string, userId: string): Promise<'success' | 'pending' | 'error'> {
  let order = await paypal<PaypalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  console.log('[paypal] order lookup', order.id, order.status);
  const custom = String(order.purchase_units?.[0]?.custom_id || '');
  const [ownerId, tier] = custom.split(':');
  if (ownerId !== userId || !PAID_TIERS.includes(tier as PaidTierId)) return 'error';
  if (order.status === 'APPROVED') {
    order = await paypal<PaypalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: 'POST' });
    console.log('[paypal] order capture', order.id, order.status);
  }
  if (order.status !== 'COMPLETED') return 'pending';
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  await prisma.user.update({
    where: { id: userId },
    data: { tier: tier as PaidTierId, subscriptionStatus: 'active', currentPeriodEnd: periodEnd },
  });
  return 'success';
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

export function isPaypalSubscriptionId(id: string | null | undefined): id is string {
  return !!id && /^I-[A-Za-z0-9]+$/.test(id);
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
