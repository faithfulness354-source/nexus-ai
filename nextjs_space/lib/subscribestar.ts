import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/db';
import { TIERS, type PaidTierId, type TierId } from '@/lib/tiers';

/** Adult site host used for OAuth, token exchange, GraphQL, and marketing links. */
export const SUBSCRIBESTAR_HOST = 'https://www.subscribestar.adult';

export const SUBSCRIBESTAR_SCOPES = [
  'subscriber.read',
  'subscriber.payments.read',
  'user.email.read',
] as const;

/** Cost in cents → Nexus tier (Free is $0 / unlinked). */
export const COST_CENTS_TO_TIER: Record<number, PaidTierId> = {
  999: 'PLUS',
  2999: 'PREMIUM',
  5000: 'ULTIMATE',
};

export function siteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || '').trim().replace(/\/$/, '');
  return raw || 'http://localhost:3000';
}

export function subscribeStarProfileUrl(): string {
  return (process.env.NEXT_PUBLIC_SUBSCRIBESTAR_PROFILE_URL || '').trim();
}

export function subscribeStarRedirectUri(): string {
  const explicit = (process.env.SUBSCRIBESTAR_REDIRECT_URI || '').trim();
  if (explicit) return explicit;
  return `${siteUrl()}/api/auth/subscribestar/callback`;
}

export function subscribeStarClientId(): string {
  return (process.env.SUBSCRIBESTAR_CLIENT_ID || '').trim();
}

export function subscribeStarClientSecret(): string {
  return (process.env.SUBSCRIBESTAR_CLIENT_SECRET || '').trim();
}

export function subscribeStarWebhookSecret(): string {
  return (process.env.SUBSCRIBESTAR_WEBHOOK_SECRET || '').trim();
}

/** Env tier id map: SubscribeStar tier_id → Nexus paid tier. */
export function envTierIdMap(): Record<string, PaidTierId> {
  const map: Record<string, PaidTierId> = {};
  const basic = (process.env.SUBSCRIBESTAR_TIER_BASIC_ID || '').trim();
  const pro = (process.env.SUBSCRIBESTAR_TIER_PRO_ID || '').trim();
  const elite = (process.env.SUBSCRIBESTAR_TIER_ELITE_ID || '').trim();
  if (basic) map[basic] = 'PLUS';
  if (pro) map[pro] = 'PREMIUM';
  if (elite) map[elite] = 'ULTIMATE';
  return map;
}

/** True when outbound SubscribeStar profile URL is set (checkout links work during review). */
export function subscribeStarPaymentsReady(): boolean {
  return !!subscribeStarProfileUrl();
}

/** True when OAuth client credentials are present (not placeholders). */
export function subscribeStarOAuthConfigured(): boolean {
  const id = subscribeStarClientId();
  const secret = subscribeStarClientSecret();
  if (!id || !secret) return false;
  if (/^your_|placeholder|changeme|xxx/i.test(id) || /^your_|placeholder|changeme|xxx/i.test(secret)) return false;
  return true;
}

export function subscribeStarWebhookConfigured(): boolean {
  const secret = subscribeStarWebhookSecret();
  if (!secret) return false;
  if (/^your_|placeholder|changeme|xxx/i.test(secret)) return false;
  return true;
}

/** Public checkout URL for a Nexus tier (profile root or tier deep-link when available). */
export function tierCheckoutUrl(tier: TierId): string {
  const profile = subscribeStarProfileUrl();
  if (!profile) return '/welcome-subscriber';
  if (tier === 'FREE') return profile;
  const envMap = envTierIdMap();
  const reverse = Object.entries(envMap).find(([, t]) => t === tier)?.[0];
  if (reverse) {
    const base = profile.replace(/\/$/, '');
    return `${base}?tier_id=${encodeURIComponent(reverse)}`;
  }
  return profile;
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: subscribeStarClientId(),
    redirect_uri: subscribeStarRedirectUri(),
    response_type: 'code',
    scope: SUBSCRIBESTAR_SCOPES.join(' '),
    state,
  });
  return `${SUBSCRIBESTAR_HOST}/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}> {
  const url = new URL(`${SUBSCRIBESTAR_HOST}/oauth2/token`);
  url.searchParams.set('client_id', subscribeStarClientId());
  url.searchParams.set('client_secret', subscribeStarClientSecret());
  url.searchParams.set('code', code);
  url.searchParams.set('grant_type', 'authorization_code');
  url.searchParams.set('redirect_uri', subscribeStarRedirectUri());

  const res = await fetch(url.toString(), { method: 'POST', headers: { Accept: 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'SubscribeStar token exchange failed.');
  }
  return data;
}

export interface SubscribeStarSubscriptionSnapshot {
  subscribeStarId: string;
  email?: string | null;
  username?: string | null;
  tierId?: string | null;
  costCents?: number | null;
  paidUntil?: Date | null;
  cancelled?: boolean;
}

async function graphql<T = unknown>(accessToken: string, query: string): Promise<T> {
  const res = await fetch(`${SUBSCRIBESTAR_HOST}/api/graphql/v1`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.errors?.length) {
    const msg = json?.errors?.[0]?.message || `SubscribeStar GraphQL error (${res.status})`;
    throw new Error(msg);
  }
  return json?.data as T;
}

function asCents(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) return Math.round(Number(value));
  return null;
}

function asDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function pickFirstSubscription(raw: any): any | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  if (Array.isArray(raw?.nodes)) return raw.nodes[0] ?? null;
  if (Array.isArray(raw?.edges)) return raw.edges[0]?.node ?? null;
  if (typeof raw === 'object') return raw;
  return null;
}

/** Fetch the authorizing user's id/email and active subscription to this creator. */
export async function fetchSubscriberSnapshot(accessToken: string): Promise<SubscribeStarSubscriptionSnapshot> {
  const rich = `
    {
      user { id name email }
      subscriber {
        id
        name
        email
        subscriptions {
          id
          cost
          paidUntil
          paid_until
          cancelled
          tier { id title cost }
          tier_id
        }
      }
    }
  `;
  let data: any;
  try {
    data = await graphql(accessToken, rich);
  } catch {
    data = await graphql(accessToken, `{ user { id name email } }`);
  }

  const user = data?.user ?? {};
  const subscriber = data?.subscriber ?? {};
  const sub = pickFirstSubscription(subscriber?.subscriptions) ?? pickFirstSubscription(data?.subscriptions);

  const subscribeStarId = String(subscriber?.id ?? user?.id ?? '').trim();
  if (!subscribeStarId) throw new Error('SubscribeStar did not return a user id.');

  const tierObj = sub?.tier && typeof sub.tier === 'object' ? sub.tier : null;
  const tierId = String(sub?.tier_id ?? tierObj?.id ?? '').trim() || null;
  const costCents = asCents(sub?.cost ?? tierObj?.cost);
  const paidUntil = asDate(sub?.paidUntil ?? sub?.paid_until ?? sub?.expires_at);

  return {
    subscribeStarId,
    email: (subscriber?.email ?? user?.email ?? null) as string | null,
    username: (subscriber?.name ?? user?.name ?? null) as string | null,
    tierId,
    costCents,
    paidUntil,
    cancelled: sub?.cancelled === true,
  };
}

/** Map SubscribeStar tier_id or cost (cents) to a Nexus tier. */
export function mapSubscribeStarToTier(opts: {
  tierId?: string | null;
  costCents?: number | null;
  cancelled?: boolean;
  paidUntil?: Date | null;
}): { tier: TierId; active: boolean } {
  if (opts.cancelled) return { tier: 'FREE', active: false };
  if (opts.paidUntil && opts.paidUntil.getTime() < Date.now()) return { tier: 'FREE', active: false };

  const byId = opts.tierId ? envTierIdMap()[opts.tierId] : undefined;
  if (byId) return { tier: byId, active: true };

  const cost = opts.costCents ?? null;
  if (cost != null && COST_CENTS_TO_TIER[cost]) {
    return { tier: COST_CENTS_TO_TIER[cost], active: true };
  }

  if (cost != null && cost > 0) {
    const known = Object.keys(COST_CENTS_TO_TIER).map(Number).sort((a, b) => a - b);
    let best: PaidTierId | null = null;
    for (const c of known) {
      if (Math.abs(c - cost) <= 50) best = COST_CENTS_TO_TIER[c];
      else if (cost >= c) best = COST_CENTS_TO_TIER[c];
    }
    if (best) return { tier: best, active: true };
  }

  return { tier: 'FREE', active: false };
}

let columnsReady: Promise<void> | null = null;

/** Additive heal for SubscribeStar columns on nexus.User and public.profiles. */
export async function ensureSubscribeStarColumns(): Promise<void> {
  if (!columnsReady) {
    columnsReady = (async () => {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE nexus."User" ADD COLUMN IF NOT EXISTS "subscribeStarId" text;
        ALTER TABLE nexus."User" ADD COLUMN IF NOT EXISTS "subscribeStarUsername" text;
        ALTER TABLE nexus."User" ADD COLUMN IF NOT EXISTS "subscribeStarPaidUntil" timestamp(3);
        ALTER TABLE nexus."User" ADD COLUMN IF NOT EXISTS "subscribeStarTierId" text;
        CREATE UNIQUE INDEX IF NOT EXISTS "User_subscribeStarId_key" ON nexus."User" ("subscribeStarId");

        ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscribestar_id text;
        ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscribestar_paid_until timestamptz;
        ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscribestar_username text;
        ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscribestar_tier_id text;
        CREATE INDEX IF NOT EXISTS profiles_subscribestar_id_idx ON public.profiles (subscribestar_id);
      `);
    })().catch((err) => {
      columnsReady = null;
      throw err;
    });
  }
  await columnsReady;
}

export async function mirrorSubscribeStarProfile(opts: {
  userId: string;
  email?: string | null;
  subscribeStarId: string;
  username?: string | null;
  paidUntil?: Date | null;
  tierId?: string | null;
}): Promise<void> {
  try {
    await ensureSubscribeStarColumns();
    if (opts.email) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO public.profiles (id, email, subscribestar_id, subscribestar_paid_until, subscribestar_username, subscribestar_tier_id)
         SELECT id, $1, $2, $3, $4, $5 FROM auth.users WHERE lower(email) = lower($1)
         ON CONFLICT (id) DO UPDATE SET
           subscribestar_id = EXCLUDED.subscribestar_id,
           subscribestar_paid_until = EXCLUDED.subscribestar_paid_until,
           subscribestar_username = EXCLUDED.subscribestar_username,
           subscribestar_tier_id = EXCLUDED.subscribestar_tier_id`,
        opts.email,
        opts.subscribeStarId,
        opts.paidUntil,
        opts.username ?? null,
        opts.tierId ?? null,
      ).catch(async () => {
        await prisma.$executeRawUnsafe(
          `UPDATE public.profiles SET
             subscribestar_id = $1,
             subscribestar_paid_until = $2,
             subscribestar_username = $3,
             subscribestar_tier_id = $4
           WHERE id::text = $5 OR subscribestar_id = $1`,
          opts.subscribeStarId,
          opts.paidUntil,
          opts.username ?? null,
          opts.tierId ?? null,
          opts.userId,
        ).catch(() => {});
      });
    }
  } catch (err) {
    console.warn('[subscribestar] profiles mirror skipped', err instanceof Error ? err.message : err);
  }
}

export async function applySubscriptionToUser(opts: {
  userId: string;
  email?: string | null;
  subscribeStarId: string;
  username?: string | null;
  tierId?: string | null;
  costCents?: number | null;
  paidUntil?: Date | null;
  cancelled?: boolean;
  statusOverride?: string | null;
}): Promise<{ tier: TierId; status: string }> {
  await ensureSubscribeStarColumns();
  const mapped = mapSubscribeStarToTier({
    tierId: opts.tierId,
    costCents: opts.costCents,
    cancelled: opts.cancelled,
    paidUntil: opts.paidUntil,
  });

  let status = opts.statusOverride
    ?? (opts.cancelled ? 'canceled' : mapped.active ? 'active' : 'canceled');
  if (status === 'canceled' && opts.paidUntil && opts.paidUntil > new Date() && !opts.cancelled) {
    status = 'canceling';
  }

  const tier: TierId = mapped.active || status === 'canceling' ? mapped.tier : 'FREE';
  const periodEnd = opts.paidUntil ?? (mapped.active ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null);

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE nexus."User" SET
         tier = $2::text::nexus."Tier",
         "subscriptionStatus" = $3,
         "currentPeriodEnd" = $4,
         "subscribeStarId" = $5,
         "subscribeStarUsername" = $6,
         "subscribeStarPaidUntil" = $7,
         "subscribeStarTierId" = $8,
         "paypalSubscriptionId" = NULL
       WHERE id = $1`,
      opts.userId,
      tier,
      status,
      periodEnd,
      opts.subscribeStarId,
      opts.username ?? null,
      periodEnd,
      opts.tierId ?? null,
    );
  } catch {
    await prisma.$executeRawUnsafe(
      `UPDATE nexus."User" SET
         tier = $2,
         "subscriptionStatus" = $3,
         "currentPeriodEnd" = $4,
         "subscribeStarId" = $5,
         "subscribeStarUsername" = $6,
         "subscribeStarPaidUntil" = $7,
         "subscribeStarTierId" = $8,
         "paypalSubscriptionId" = NULL
       WHERE id = $1`,
      opts.userId,
      tier,
      status,
      periodEnd,
      opts.subscribeStarId,
      opts.username ?? null,
      periodEnd,
      opts.tierId ?? null,
    );
  }

  await mirrorSubscribeStarProfile({
    userId: opts.userId,
    email: opts.email,
    subscribeStarId: opts.subscribeStarId,
    username: opts.username,
    paidUntil: periodEnd,
    tierId: opts.tierId,
  });

  return { tier, status };
}

export async function findUserBySubscribeStar(opts: {
  subscribeStarId?: string | null;
  email?: string | null;
}): Promise<{ id: string; email: string } | null> {
  await ensureSubscribeStarColumns();
  const ssId = (opts.subscribeStarId || '').trim();
  if (ssId) {
    const byId = await prisma.$queryRaw<Array<{ id: string; email: string }>>`
      SELECT id, email FROM nexus."User" WHERE "subscribeStarId" = ${ssId} LIMIT 1
    `.catch(() => [] as Array<{ id: string; email: string }>);
    if (byId[0]) return byId[0];
  }
  const email = (opts.email || '').trim().toLowerCase();
  if (email) {
    const byEmail = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true },
    });
    if (byEmail) return byEmail;
  }
  return null;
}

/** HMAC-MD5 hex digest of the raw webhook body. */
export function verifySubscribeStarSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = subscribeStarWebhookSecret();
  if (!secret || !signatureHeader) return false;
  const expected = createHmac('md5', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signatureHeader.trim(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function priceLabel(tier: TierId): string {
  const p = TIERS[tier].price;
  return p === 0 ? 'Free' : `$${p.toFixed(2)}/mo`;
}
