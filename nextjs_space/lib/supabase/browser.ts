'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAnonKey, usableSupabaseUrl } from '@/lib/supabase/env';

let browser: SupabaseClient | null = null;

/** Browser client. Uses the public anon key; the user session is attached after local sign-in. */
export function supabaseBrowser(): SupabaseClient | null {
  const url = usableSupabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) return null;
  if (!browser) {
    browser = createBrowserClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      realtime: {
        heartbeatIntervalMs: 15000,
        reconnectAfterMs: (tries: number) => Math.min(1000 * 2 ** Math.max(tries - 1, 0), 15000),
      },
    });
  }
  return browser;
}
