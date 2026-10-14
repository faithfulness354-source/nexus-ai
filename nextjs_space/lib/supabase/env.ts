export function supabaseUrl(): string {
  return (process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
}

export function supabaseAnonKey(): string {
  return (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
}

/** https project URLs, plus http only for a local Supabase. Anything else stays disconnected. */
export function usableSupabaseUrl(): string {
  const raw = supabaseUrl();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return url.origin;
  } catch {
    return '';
  }
  return '';
}
