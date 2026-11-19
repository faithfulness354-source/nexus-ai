'use client';

import type { PaidTierId, TierId } from '@/lib/tiers';

/** Opens the SubscribeStar profile/tier checkout URL for the selected plan. */
export async function startCheckout(tier: PaidTierId): Promise<boolean> {
  const res = await fetch('/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = `/login?callbackUrl=${encodeURIComponent('/settings?tab=subscription')}`;
    return false;
  }
  if (!res.ok) {
    console.error('SubscribeStar checkout failed', data?.error || data);
    throw new Error(data?.error ?? 'Could not open SubscribeStar checkout');
  }
  if (data?.url) {
    window.open(data.url, '_blank', 'noopener,noreferrer');
    return false;
  }
  throw new Error('SubscribeStar checkout URL is not configured.');
}

/** Starts SubscribeStar OAuth account linking. */
export function connectSubscribeStar(): void {
  window.location.href = '/api/auth/subscribestar/login';
}

/** Cancel is managed on SubscribeStar — open the subscriber settings / profile. */
export async function manageSubscription(): Promise<void> {
  const res = await fetch('/api/billing/portal', { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? 'Could not open subscription management');
  if (data?.url) window.open(data.url, '_blank', 'noopener,noreferrer');
}

/** @deprecated Use manageSubscription — kept for older call sites. */
export async function cancelSubscription(): Promise<void> {
  return manageSubscription();
}

export type { TierId };
