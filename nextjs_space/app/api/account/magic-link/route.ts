export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { appOrigin, createAuthToken, isValidEmail, sendAuthEmail } from '@/lib/auth-tokens';
import { isWhitelistedEmail } from '@/lib/admin';

/** Emails a one-time sign-in link. Same response whether or not the account exists. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.email ?? '').trim().toLowerCase();
    const callbackUrl = String(body?.callbackUrl ?? '/');
    if (!isValidEmail(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user || isWhitelistedEmail(email)) {
      const token = await createAuthToken('magic', email);
      const safe = callbackUrl.startsWith('/') && !callbackUrl.startsWith('//') ? callbackUrl : '/';
      const url = `${appOrigin(request)}/magic-link?token=${encodeURIComponent(token)}${safe !== '/' ? `&callbackUrl=${encodeURIComponent(safe)}` : ''}`;
      await sendAuthEmail({
        to: email,
        subject: 'Your NexusAI sign-in link',
        heading: 'Sign in to NexusAI',
        intro: 'Click the button below to sign in instantly — no password needed.',
        cta: 'Sign in to NexusAI',
        url,
        expiresIn: '15 minutes',
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('POST /api/account/magic-link error:', err);
    return NextResponse.json({ error: 'Could not send the sign-in link. Please try again.' }, { status: 500 });
  }
}
