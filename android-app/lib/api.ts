/** Live Next.js host. EXPO_PUBLIC_API_URL overrides this for a mobile build. */
const LIVE_API_URL = 'https://nexus-ai-navy-xi.vercel.app';

function configuredApiUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || LIVE_API_URL;
  return raw.trim().replace(/\/$/, '');
}

/** Production API origin. Localhost and LAN addresses are not used. */
export function liveApiUrl(): string {
  try {
    const url = new URL(configuredApiUrl());
    const host = url.hostname;
    const local = host === 'localhost' || host === '127.0.0.1' || host === '10.0.2.2' || host.startsWith('192.168.');
    if (local || (url.protocol !== 'https:' && url.protocol !== 'http:')) return LIVE_API_URL;
    return url.origin;
  } catch {
    return LIVE_API_URL;
  }
}
