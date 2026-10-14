export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getViewer } from '@/lib/access';
import { isSupabaseConfigured } from '@/lib/supabase/admin';
import { applyRemoteRecord, removeRemoteRecord } from '@/lib/supabase/apply';

const TABLES = new Set(['characters', 'scenarios', 'chats', 'chat_messages', 'personas']);

/** Applies one live cloud row onto the local database for the signed-in account. */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ configured: false });
  const viewer = await getViewer();
  if (!viewer?.user.email) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const table = typeof body?.table === 'string' ? body.table : '';
  const record = body?.record;
  if (!TABLES.has(table) || !record || typeof record !== 'object') {
    return NextResponse.json({ error: 'Nothing to apply' }, { status: 400 });
  }
  if (body?.deleted === true) {
    await removeRemoteRecord(viewer.user, table, record as Record<string, unknown>);
    return NextResponse.json({ ok: true });
  }
  await applyRemoteRecord(viewer.user, table, record as Record<string, unknown>);
  return NextResponse.json({ ok: true });
}
