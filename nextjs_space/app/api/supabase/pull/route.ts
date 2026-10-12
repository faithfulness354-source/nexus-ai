export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/access';
import { isSupabaseConfigured } from '@/lib/supabase/admin';
import { pullCloudAccount } from '@/lib/supabase/apply';

/** Pulls this account's cloud characters, scenarios, chats, and messages into the local database. */
export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ configured: false });
  const viewer = await getViewer();
  if (!viewer?.user.email) return NextResponse.json({ configured: true, authenticated: false }, { status: 401 });
  void pullCloudAccount(viewer.user);
  return NextResponse.json({ configured: true, authenticated: true });
}
