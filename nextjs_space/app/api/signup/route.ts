export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { isWhitelistedEmail } from '@/lib/admin';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) ?? {};
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const name = String(body.name ?? body.fullName ?? '').trim() || email.split('@')[0];

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    if (body.termsAccepted !== true) return NextResponse.json({ error: 'Agree to the Terms of Service and confirm you are 18 or older.' }, { status: 400 });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });

    const admin = isWhitelistedEmail(email);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: await bcrypt.hash(password, 12),
        role: admin ? 'CREATOR_ADMIN' : 'USER',
        isWhitelisted: admin,
        termsAcceptedAt: new Date(),
      },
      select: { id: true, email: true, name: true },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/signup error:', err);
    return NextResponse.json({ error: 'Sign up failed. Please try again.' }, { status: 500 });
  }
}
