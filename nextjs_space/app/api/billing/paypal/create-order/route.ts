export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { NextRequest } from 'next/server';
import { getViewer, json, unauthorized } from '@/lib/access';
import { createPaypalOrder } from '@/lib/paypal';
import { PAID_TIERS, TIERS, type PaidTierId } from '@/lib/tiers';

/** Creates a live PayPal order and returns its id. */
export async function POST(request: NextRequest) {
  try {
    const viewer = await getViewer();
    if (!viewer) return unauthorized();
    const { tier } = (await request.json().catch(() => ({}))) ?? {};
    if (!PAID_TIERS.includes(tier)) return json({ error: 'Choose Plus, Premium or Ultimate.' }, 400);

    const origin = request.headers.get('origin') ?? new URL(request.url).origin;
    const order = await createPaypalOrder({
      value: TIERS[tier as PaidTierId].price.toFixed(2),
      description: `NexusAI ${TIERS[tier as PaidTierId].name}`,
      customId: `${viewer.user.id}:${tier}`,
      returnUrl: `${origin}/api/billing/paypal/return`,
      cancelUrl: `${origin}/settings?tab=subscription&checkout=cancelled`,
    });
    const url = order.links?.find((link) => link.rel === 'payer-action' || link.rel === 'approve')?.href;
    if (!order.id) return json({ error: 'PayPal did not return an order id.' }, 502);
    return json({ id: order.id, url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not start PayPal checkout. Please try again.';
    console.error('POST /api/billing/paypal/create-order error:', message);
    return json({ error: message }, 500);
  }
}
