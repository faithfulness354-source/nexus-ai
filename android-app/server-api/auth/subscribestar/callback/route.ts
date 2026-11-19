export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getViewer } from '@/lib/access';
import {
  applySubscriptionToUser,
  exchangeCodeForToken,
  fetchSubscriberSnapshot,
  siteUrl,
  subscribeStarOAuthConfigured,
} from '@/lib/subscribestar';

function redirectToSettings(query: Record<string, string>) {
  const u = new URL('/settings', siteUrl());
  u.searchParams.set('tab', 'subscription');
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  return NextResponse.redirect(u);
}

export async function GET(request: NextRequest) {
  if (!subscribeStarOAuthConfigured()) {
    return redirectToSettings({ ss: 'oauth_not_configured' });
  }

  const code = request.nextUrl.searchParams.get('code')?.trim() || '';
  const state = request.nextUrl.searchParams.get('state')?.trim() || '';
  const err = request.nextUrl.searchParams.get('error');
  if (err) return redirectToSettings({ ss: 'denied' });

  const expectedState = request.cookies.get('ss_oauth_state')?.value || '';
  const cookieUid = request.cookies.get('ss_oauth_uid')?.value || '';
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToSettings({ ss: 'invalid_state' });
  }

  const viewer = await getViewer();
  if (!viewer) return redirectToSettings({ ss: 'login_required' });
  if (cookieUid && cookieUid !== viewer.user.id) {
    return redirectToSettings({ ss: 'account_mismatch' });
  }

  try {
    const token = await exchangeCodeForToken(code);
    const snap = await fetchSubscriberSnapshot(token.access_token);
    await applySubscriptionToUser({
      userId: viewer.user.id,
      email: viewer.user.email || snap.email,
      subscribeStarId: snap.subscribeStarId,
      username: snap.username,
      tierId: snap.tierId,
      costCents: snap.costCents,
      paidUntil: snap.paidUntil,
      cancelled: snap.cancelled,
    });
    const res = redirectToSettings({ ss: 'linked' });
    res.cookies.set('ss_oauth_state', '', { path: '/', maxAge: 0 });
    res.cookies.set('ss_oauth_uid', '', { path: '/', maxAge: 0 });
    return res;
  } catch (e: any) {
    console.error('[subscribestar] callback failed', e?.message || e);
    return redirectToSettings({ ss: 'error' });
  }
}
