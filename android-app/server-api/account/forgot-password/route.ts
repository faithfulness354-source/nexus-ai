export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { appOrigin, createAuthToken, isValidEmail, sendAuthEmail } from '@/lib/auth-tokens';

/** Sends a password reset link. Always answers the same way so emails can't be probed. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.email ?? '').trim().toLowerCase();
    if (!isValidEmail(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user) {
      const token = await createAuthToken('reset', email);
      const url = `${appOrigin(request)}/reset-password?token=${encodeURIComponent(token)}`;
      await sendAuthEmail({
        to: email,
        subject: 'Reset your NexusAI password',
        heading: 'Reset your password',
        intro: 'We received a request to reset the password for your NexusAI account. Click the button below to choose a new one.',
        cta: 'Choose a new password',
        url,
        expiresIn: '1 hour',
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('POST /api/account/forgot-password error:', err);
    return NextResponse.json({ error: 'Could not send the reset email. Please try again.' }, { status: 500 });
  }
}
