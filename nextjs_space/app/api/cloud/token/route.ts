export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { isWhitelistedEmail } from '@/lib/admin';

function cookieName(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-proto');
  const https = forwarded === 'https' || request.nextUrl.protocol === 'https:';
  return https ? '__Secure-authjs.session-token' : 'authjs.session-token';
}

/** Issues the same session token the browser uses, so the mobile app can call this server. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  if (!email || !password) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.password) {
    console.error('[auth] sign-in rejected', { provider: 'cloud-token', reason: 'unknown-account', whitelist: isWhitelistedEmail(email) });
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  if (!(await bcrypt.compare(password, user.password))) {
    console.error('[auth] sign-in rejected', { provider: 'cloud-token', reason: 'password-mismatch', whitelist: isWhitelistedEmail(email) });
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error('[auth] sign-in rejected', { provider: 'cloud-token', reason: 'missing-auth-secret' });
    return NextResponse.json({ error: 'Sign-in is not configured' }, { status: 503 });
  }

  const isAdmin = user.role === 'CREATOR_ADMIN' || user.isWhitelisted || isWhitelistedEmail(user.email);
  if (isWhitelistedEmail(user.email) && (user.role !== 'CREATOR_ADMIN' || !user.isWhitelisted)) {
    await prisma.user.update({ where: { id: user.id }, data: { role: 'CREATOR_ADMIN', isWhitelisted: true } });
  }
  const salt = cookieName(request);
  const token = await encode({
    token: { sub: user.id, id: user.id, email: user.email, name: user.name, role: isAdmin ? 'CREATOR_ADMIN' : 'USER' },
    secret,
    salt,
    maxAge: 30 * 24 * 60 * 60,
  });

  const headers = new Headers({ 'Cache-Control': 'no-store' });
  if (!token.includes(';')) {
    headers.set('Set-Cookie', `${salt}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
  }
  return NextResponse.json({ token }, { status: 200, headers });
}
