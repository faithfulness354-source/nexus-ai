export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getViewer, unauthorized } from '@/lib/access';
import { markAdultVerified, isAdultVerifiedUser } from '@/lib/trust-safety';

/**
 * Persists 18+ confirmation from the age-gate splash to the user row.
 * Body: { confirmed: true, age?: number } — age must be >= 18 when provided.
 */
export async function POST(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const confirmed = body?.confirmed === true;
  const age = typeof body?.age === 'number' ? body.age : null;

  if (!confirmed) {
    return NextResponse.json({ error: 'Confirmation required.', code: 'AGE_NOT_CONFIRMED' }, { status: 400 });
  }
  if (age != null && (!Number.isFinite(age) || age < 18)) {
    return NextResponse.json({ error: 'You must be 18 or older.', code: 'UNDERAGE' }, { status: 403 });
  }

  await markAdultVerified(viewer.user.id);
  return NextResponse.json({
    ok: true,
    isAdultVerified: true,
    previouslyVerified: isAdultVerifiedUser(viewer.user),
  });
}

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  return NextResponse.json({ isAdultVerified: isAdultVerifiedUser(viewer.user) });
}
