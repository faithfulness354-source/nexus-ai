export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { ensureCloudUser } from '@/lib/supabase/identity';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** Local acceptance is the gate. The cloud profile is updated when Supabase is configured. */
async function mirrorProfile(localUserId: string, email: string, acceptedAt: Date) {
  try {
    const admin = supabaseAdmin();
    if (!admin) return;
    const id = await ensureCloudUser(email, localUserId);
    if (!id) return;
    const stamp = acceptedAt.toISOString();
    const { error } = await admin.from('profiles').upsert({
      id,
      accepted_tos: true,
      terms_accepted: true,
      tos_accepted_at: stamp,
      terms_accepted_at: stamp,
    });
    if (error) console.log(`Profile terms sync failed: ${error.message}`);
  } catch (error) {
    console.log(`Profile terms sync failed: ${error instanceof Error ? error.message : 'unknown'}`);
  }
}

export async function GET() {
  try {
    const session = await auth();
    const id = session?.user?.id;
    if (!id) return NextResponse.json({ authenticated: false, accepted: false });
    const user = await prisma.user.findUnique({
      where: { id },
      select: { termsAcceptedAt: true },
    });
    return NextResponse.json({
      authenticated: true,
      accepted: Boolean(user?.termsAcceptedAt),
      tos_accepted_at: user?.termsAcceptedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.log(`GET /api/account/tos failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return NextResponse.json({ authenticated: true, accepted: false, error: 'Could not read terms status.' }, { status: 503 });
  }
}

export async function POST() {
  try {
    const session = await auth();
    const id = session?.user?.id;
    const email = session?.user?.email;
    if (!id || !email) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

    const existing = await prisma.user.findUnique({ where: { id }, select: { termsAcceptedAt: true } });
    const acceptedAt = existing?.termsAcceptedAt ?? new Date();
    const user = await prisma.user.update({
      where: { id },
      data: { termsAcceptedAt: acceptedAt },
      select: { id: true, email: true, termsAcceptedAt: true },
    });
    try {
      await prisma.$executeRaw`UPDATE "User" SET "termsAccepted" = true WHERE id = ${id}`;
    } catch (error) {
      console.log(`Terms flag sync failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
    if (user.termsAcceptedAt) await mirrorProfile(user.id, user.email, user.termsAcceptedAt);
    return NextResponse.json({
      accepted: true,
      acceptedTerms: true,
      tos_accepted_at: user.termsAcceptedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.log(`POST /api/account/tos failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return NextResponse.json({ error: 'Could not save your acceptance.' }, { status: 500 });
  }
}
