'use client';

import { toast } from 'sonner';
import type { PaidTierId } from '@/lib/tiers';

/** Starts PayPal checkout (or a plan change, which PayPal asks the buyer to approve). */
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
  if (!res.ok) throw new Error(data?.error ?? 'Could not start checkout');
  if (data?.switched) {
    toast.success('Your plan was updated.');
    return true;
  }
  if (data?.url) window.location.href = data.url;
  return false;
}

/** Cancels the PayPal subscription; the plan stays until the paid period ends. */
export async function cancelSubscription(): Promise<void> {
  const res = await fetch('/api/billing/portal', { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? 'Could not cancel the subscription');
}
