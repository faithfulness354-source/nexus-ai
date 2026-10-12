export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { json } from '@/lib/access';
import { paypal, paypalConfigured, syncPaypalSubscription, verifyWebhook, type PaypalSubscription } from '@/lib/paypal';

/** PayPal webhook: subscription lifecycle + payment events. Subscribe to BILLING.SUBSCRIPTION.* and PAYMENT.SALE.COMPLETED. */
export async function POST(request: NextRequest) {
  if (!paypalConfigured() || !process.env.PAYPAL_WEBHOOK_ID?.trim()) return json({ error: 'PayPal webhook not configured' }, 503);
  let event: any;
  try {
    event = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  try {
    if (!(await verifyWebhook(request.headers, event))) return json({ error: 'Invalid signature' }, 400);
    if (await prisma.stripeEvent.findUnique({ where: { id: `paypal:${event.id}` } })) return json({ received: true, duplicate: true });

    const type: string = event.event_type ?? '';
    const resource = event.resource ?? {};
    // Subscription events carry the subscription; sale events reference it via billing_agreement_id.
    const subId: string | undefined = type.startsWith('BILLING.SUBSCRIPTION.') ? resource.id : resource.billing_agreement_id;
    if (subId) {
      // Re-fetch so we always act on the current state, not a possibly out-of-order payload.
      await syncPaypalSubscription(await paypal<PaypalSubscription>(`/v1/billing/subscriptions/${subId}`));
    }
    await prisma.stripeEvent.create({ data: { id: `paypal:${event.id}`, type } }).catch(() => {});
    return json({ received: true });
  } catch (err: any) {
    console.error('PayPal webhook error:', err?.message);
    return json({ error: 'Webhook handling failed' }, 500);
  }
}
