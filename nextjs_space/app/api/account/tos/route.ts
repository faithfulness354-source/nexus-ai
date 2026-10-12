export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { ensureCloudUser } from '@/lib/supabase/identity';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** Local acceptance is the gate. The cloud profile is updated when Supabase is configured. */
async function mirrorProfile(localUserId: string, email: string, acceptedAt: Date) {
  const admin = supabaseAdmin();
  if (!admin) return;
  const id = await ensureCloudUser(email, localUserId);
  if (!id) return;
  const { error } = await admin.from('profiles').upsert({
    id,
    accepted_tos: true,
    tos_accepted_at: acceptedAt.toISOString(),
  });
  if (error) console.log(`Profile terms sync failed: ${error.message}`);
}

export async function GET() {
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
}

export async function POST() {
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
  if (user.termsAcceptedAt) await mirrorProfile(user.id, user.email, user.termsAcceptedAt);
  return NextResponse.json({
    accepted: true,
    tos_accepted_at: user.termsAcceptedAt?.toISOString() ?? null,
  });
}
