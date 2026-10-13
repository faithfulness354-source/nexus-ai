export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { getViewer, json, unauthorized } from '@/lib/access';
import { getPlanId, paypal, type PaypalSubscription } from '@/lib/paypal';
import { PAID_TIERS, TIERS, type PaidTierId } from '@/lib/tiers';

const approveLink = (sub: PaypalSubscription) => sub.links?.find((l) => l.rel === 'approve')?.href;

export async function POST(request: NextRequest) {
  try {
    const viewer = await getViewer();
    if (!viewer) return unauthorized();

    const { tier } = (await request.json().catch(() => ({}))) ?? {};
    if (!PAID_TIERS.includes(tier)) return json({ error: 'Choose Plus, Premium or Ultimate.' }, 400);

    const planId = await getPlanId(tier as PaidTierId);
    const user = viewer.user;
    const origin = request.headers.get('origin') ?? new URL(request.url).origin;
    const returnUrl = `${origin}/api/billing/paypal/return`;
    const cancelUrl = `${origin}/settings?tab=subscription&checkout=cancelled`;
    const context = {
      brand_name: 'NexusAI',
      user_action: 'SUBSCRIBE_NOW',
      shipping_preference: 'NO_SHIPPING',
      return_url: returnUrl,
      cancel_url: cancelUrl,
    };

    // Already subscribed: revise the existing PayPal subscription to the new plan (buyer re-approves).
    if (user.paypalSubscriptionId && ['active', 'past_due'].includes(user.subscriptionStatus ?? '')) {
      const current = await paypal<PaypalSubscription>(`/v1/billing/subscriptions/${user.paypalSubscriptionId}`);
      if (current.plan_id === planId) return json({ error: `You're already on ${TIERS[tier as PaidTierId].name}.` }, 400);
      const revised = await paypal<PaypalSubscription>(`/v1/billing/subscriptions/${current.id}/revise`, {
        method: 'POST',
        body: { plan_id: planId, application_context: { ...context, return_url: `${returnUrl}?subscription_id=${current.id}` } },
      });
      const url = approveLink(revised);
      if (!url) return json({ error: 'PayPal did not return an approval link.' }, 502);
      return json({ url });
    }

    const sub = await paypal<PaypalSubscription>('/v1/billing/subscriptions', {
      method: 'POST',
      body: { plan_id: planId, custom_id: user.id, subscriber: { email_address: user.email }, application_context: context },
    });
    const url = approveLink(sub);
    if (!url) return json({ error: 'PayPal did not return an approval link.' }, 502);
    return json({ url });
  } catch (err: any) {
    console.error('POST /api/billing/checkout error:', err?.message);
    return json({ error: 'Could not start PayPal checkout. Please try again.' }, 500);
  }
}
