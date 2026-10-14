import 'server-only';
import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** Stable cloud user id for a local account, so repeat syncs hit the same auth user. */
export function cloudUserId(localUserId: string): string {
  const hex = createHash('sha256').update(`nexus-user:${localUserId}`).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

export async function ensureCloudUser(email: string, localUserId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const address = email.trim().toLowerCase();
  if (!admin || !address || !localUserId) return null;
  const id = cloudUserId(localUserId);
  const existing = await admin.auth.admin.getUserById(id);
  if (existing.error) {
    console.error('[supabase] getUserById failed', { status: existing.error.status, message: existing.error.message });
  }
  if (existing.data.user) return existing.data.user.id;
  const created = await admin.auth.admin.createUser({
    id,
    email: address,
    email_confirm: true,
    user_metadata: { local_user_id: localUserId },
  });
  if (created.data.user) return created.data.user.id;
  if (created.error) {
    console.error('[supabase] createUser failed', { status: created.error.status, message: created.error.message });
  }
  if (!created.error || !/already|registered|exists/i.test(created.error.message)) return null;
  const linked = await admin.auth.admin.generateLink({ type: 'magiclink', email: address });
  if (linked.error) {
    console.error('[supabase] generateLink failed', { status: linked.error.status, message: linked.error.message });
  }
  return linked.data?.user?.id ?? null;
}

export async function mintCloudSession(email: string, localUserId: string): Promise<{ access_token: string; refresh_token: string } | null> {
  const admin = supabaseAdmin();
  const userId = await ensureCloudUser(email, localUserId);
  if (!admin || !userId) return null;
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: email.trim().toLowerCase() });
  if (link.error) {
    console.error('[supabase] session link failed', { status: link.error.status, message: link.error.message });
  }
  const tokenHash = link.data?.properties?.hashed_token;
  if (!tokenHash) return null;
  const verified = await admin.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (verified.error) {
    console.error('[supabase] verifyOtp failed', { status: verified.error.status, message: verified.error.message });
  }
  const session = verified.data.session;
  if (!session?.access_token || !session.refresh_token) return null;
  return { access_token: session.access_token, refresh_token: session.refresh_token };
}
