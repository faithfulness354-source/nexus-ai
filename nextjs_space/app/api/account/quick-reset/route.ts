export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { consumeResetCode, createResetCode, isValidEmail, sendAuthEmail } from '@/lib/auth-tokens';
import { isWhitelistedEmail } from '@/lib/admin';

/**
 * Inline password reset used by the Sign In form. No old password is ever required.
 *  step "request": emails a one-time code (same reply whether or not the account exists).
 *  step "confirm": verifies the code, writes the new bcrypt hash directly and returns ok so the
 *                  client can sign in immediately. Whitelisted creator emails are re-promoted to
 *                  CREATOR_ADMIN (and created if missing).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.email ?? '').trim().toLowerCase();
    if (!isValidEmail(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    const admin = isWhitelistedEmail(email);

    if (body?.step === 'request') {
      const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (user || admin) {
        const code = await createResetCode(email);
        const sent = await sendAuthEmail({
          to: email,
          subject: `Your NexusAI reset code: ${code}`,
          heading: 'Your password reset code',
          intro: 'Enter this code on the NexusAI sign-in page to set your new password and sign in.',
          cta: '',
          url: '',
          expiresIn: '15 minutes',
          code,
        });
        if (!sent.delivered) return NextResponse.json({ ok: true, previewCode: code });
      }
      return NextResponse.json({ ok: true });
    }

    if (body?.step === 'confirm') {
      const password = String(body?.password ?? '');
      if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
      if (!(await consumeResetCode(email, String(body?.code ?? '')))) {
        return NextResponse.json({ error: 'That code is invalid or has expired. Request a new one.' }, { status: 400 });
      }
      const hash = await bcrypt.hash(password, 12);
      const adminData = admin ? { role: 'CREATOR_ADMIN' as const, isWhitelisted: true } : {};
      if (admin) {
        await prisma.user.upsert({
          where: { email },
          update: { password: hash, emailVerified: new Date(), ...adminData },
          create: { email, password: hash, emailVerified: new Date(), name: 'Creator', ...adminData },
        });
      } else {
        await prisma.user.update({ where: { email }, data: { password: hash, emailVerified: new Date() } });
      }
      return NextResponse.json({ ok: true, admin });
    }

    return NextResponse.json({ error: 'Unknown step.' }, { status: 400 });
  } catch (err: any) {
    console.error('POST /api/account/quick-reset error:', err);
    return NextResponse.json({ error: 'Could not reset the password. Please try again.' }, { status: 500 });
  }
}
