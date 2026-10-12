export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { consumeAuthToken, peekAuthToken } from '@/lib/auth-tokens';
import { isWhitelistedEmail } from '@/lib/admin';

/** GET ?token= → { valid } so the page can show an expired-link message up front. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  return NextResponse.json({ valid: await peekAuthToken('reset', token) });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const password = String(body?.password ?? '');
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    const email = await consumeAuthToken('reset', String(body?.token ?? ''));
    if (!email) return NextResponse.json({ error: 'This reset link is invalid or has expired. Request a new one.' }, { status: 400 });
    const admin = isWhitelistedEmail(email);
    await prisma.user.update({
      where: { email },
      data: {
        password: await bcrypt.hash(password, 12),
        emailVerified: new Date(),
        ...(admin ? { role: 'CREATOR_ADMIN' as const, isWhitelisted: true } : {}),
      },
    });
    return NextResponse.json({ ok: true, email });
  } catch (err: any) {
    console.error('POST /api/account/reset-password error:', err);
    return NextResponse.json({ error: 'Could not reset the password. Please try again.' }, { status: 500 });
  }
}
