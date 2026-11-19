export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getViewer, unauthorized } from '@/lib/access';
import { isTierId, type PaidTierId } from '@/lib/tiers';
import { subscribeStarPaymentsReady, tierCheckoutUrl } from '@/lib/subscribestar';

/** Returns a SubscribeStar profile/tier URL for the selected Nexus plan. */
export async function POST(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const tier = body?.tier;
  if (!isTierId(tier) || tier === 'FREE') {
    return NextResponse.json({ error: 'Choose Plus, Premium, or Ultimate.' }, { status: 400 });
  }

  if (!subscribeStarPaymentsReady()) {
    return NextResponse.json({
      url: '/welcome-subscriber',
      note: 'SubscribeStar profile URL is not configured yet. After you subscribe, link your account in Settings.',
    });
  }

  return NextResponse.json({
    url: tierCheckoutUrl(tier as PaidTierId),
    provider: 'subscribestar',
  });
}
