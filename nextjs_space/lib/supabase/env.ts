/** Live Supabase project. The phone and the site sync here, not to a local database. */
export const LIVE_SUPABASE_URL = 'https://tlzfucupzqtihszptunx.supabase.co';

export function supabaseUrl(): string {
  return LIVE_SUPABASE_URL;
}

export function supabaseAnonKey(): string {
  return (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
}

/** Live https project URL. Local Supabase hosts stay disconnected. */
export function usableSupabaseUrl(): string {
  const raw = supabaseUrl();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.local');
    if (url.protocol === 'https:' && !local) return url.origin;
  } catch {
    return '';
  }
  return '';
}
