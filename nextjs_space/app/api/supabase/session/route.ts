export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/access';
import { isSupabaseConfigured } from '@/lib/supabase/admin';
import { mintCloudSession } from '@/lib/supabase/identity';
import { pushLocalAccount } from '@/lib/supabase/sync';

/** Turns the local login into a Supabase session the browser can use for direct writes. */
export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ configured: false });
  const viewer = await getViewer();
  if (!viewer?.user.email) return NextResponse.json({ configured: true, authenticated: false }, { status: 401 });
  const session = await mintCloudSession(viewer.user.email, viewer.user.id);
  if (!session) return NextResponse.json({ configured: true, authenticated: false }, { status: 503 });
  void pushLocalAccount(viewer.user);
  return NextResponse.json({ configured: true, authenticated: true, ...session });
}
