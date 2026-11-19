export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getViewer, unauthorized } from '@/lib/access';
import {
  buildAuthorizeUrl,
  subscribeStarOAuthConfigured,
} from '@/lib/subscribestar';

/**
 * Starts SubscribeStar OAuth2. Sets a short-lived state cookie, then redirects
 * to https://www.subscribestar.adult/oauth2/authorize.
 */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();

  if (!subscribeStarOAuthConfigured()) {
    return NextResponse.json(
      {
        error: 'SubscribeStar account linking is not configured yet. You can still subscribe on SubscribeStar; linking will unlock once OAuth credentials are set.',
        code: 'SUBSCRIBESTAR_OAUTH_NOT_CONFIGURED',
      },
      { status: 503 },
    );
  }

  const state = randomBytes(24).toString('hex');
  const url = buildAuthorizeUrl(state);
  const res = NextResponse.redirect(url);
  res.cookies.set('ss_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });
  res.cookies.set('ss_oauth_uid', viewer.user.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });
  return res;
}
