export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getViewer, unauthorized } from '@/lib/access';
import { subscribeStarProfileUrl } from '@/lib/subscribestar';

/** Subscriptions are managed on SubscribeStar.adult — we only deep-link the profile. */
export async function POST() {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  const url = subscribeStarProfileUrl() || 'https://www.subscribestar.adult';
  return NextResponse.json({ url, provider: 'subscribestar' });
}
