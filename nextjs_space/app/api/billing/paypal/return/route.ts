export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getViewer } from '@/lib/access';
import { isPaypalSubscriptionId, paypal, syncPaypalSubscription, type PaypalSubscription } from '@/lib/paypal';

function siteOrigin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : request.nextUrl.origin;
}

/** PayPal redirects here after the buyer approves; confirm the subscription and update the plan right away. */
export async function GET(request: NextRequest) {
  const back = (result: string) => NextResponse.redirect(`${siteOrigin(request)}/settings?tab=subscription&checkout=${result}`);
  try {
    const id = request.nextUrl.searchParams.get('subscription_id');
    const viewer = await getViewer();
    if (!id || !viewer) return back('pending');
    if (!isPaypalSubscriptionId(id)) return back('error');

    const sub = await paypal<PaypalSubscription>(`/v1/billing/subscriptions/${id}`);
    const owns = sub.custom_id === viewer.user.id || viewer.user.paypalSubscriptionId === sub.id;
    if (!owns) return back('error');
    await syncPaypalSubscription({ ...sub, custom_id: viewer.user.id });
    return back(sub.status === 'ACTIVE' ? 'success' : 'pending');
  } catch (err: any) {
    console.error('GET /api/billing/paypal/return error:', err?.message);
    return back('pending');
  }
}
