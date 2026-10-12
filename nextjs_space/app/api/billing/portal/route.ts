export const dynamic = 'force-dynamic';
import { getViewer, json, unauthorized } from '@/lib/access';
import { paypal, paypalConfigured, syncPaypalSubscription, type PaypalSubscription } from '@/lib/paypal';

/** Cancels the viewer's PayPal subscription. They keep the plan until the paid period ends. */
export async function POST() {
  try {
    const viewer = await getViewer();
    if (!viewer) return unauthorized();
    if (!paypalConfigured()) return json({ error: 'Payments are not set up yet.', code: 'PAYMENTS_NOT_CONFIGURED' }, 503);
    const id = viewer.user.paypalSubscriptionId;
    if (!id) return json({ error: 'You have no active subscription.' }, 400);

    await paypal(`/v1/billing/subscriptions/${id}/cancel`, { method: 'POST', body: { reason: 'Cancelled by the user in NexusAI settings' } });
    await syncPaypalSubscription(await paypal<PaypalSubscription>(`/v1/billing/subscriptions/${id}`));
    return json({ cancelled: true });
  } catch (err: any) {
    if (err?.message === 'PayPal is not configured') {
      return json({ error: 'Payments are not set up yet.', code: 'PAYMENTS_NOT_CONFIGURED' }, 503);
    }
    console.error('POST /api/billing/portal error:', err?.message);
    return json({ error: 'Could not cancel the subscription. You can also cancel it from your PayPal account.' }, 500);
  }
}
