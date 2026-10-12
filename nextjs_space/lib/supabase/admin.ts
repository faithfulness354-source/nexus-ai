import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAnonKey, usableSupabaseUrl } from '@/lib/supabase/env';

let admin: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(usableSupabaseUrl() && supabaseAnonKey() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/** Service-role client. Stays on the server and bypasses row security for sync. */
export function supabaseAdmin(): SupabaseClient | null {
  const url = usableSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  if (!url || !key) return null;
  if (!admin) {
    admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
