import type { CapacitorConfig } from '@capacitor/cli';

/** Live Next.js host the Samsung WebView opens. */
const LIVE_API_URL = 'https://nexus-ai-navy-xi.vercel.app';

function configuredServerUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL?.trim() || process.env.CAPACITOR_SERVER_URL?.trim() || LIVE_API_URL;
  try {
    const url = new URL(raw);
    const host = url.hostname;
    const local = host === 'localhost' || host === '127.0.0.1' || host === '10.0.2.2' || host.startsWith('192.168.');
    if (local || url.protocol !== 'https:') return LIVE_API_URL;
    return url.origin;
  } catch {
    return LIVE_API_URL;
  }
}

const serverUrl = configuredServerUrl();

const config: CapacitorConfig = {
  appId: 'com.nexusai.roleplay',
  appName: 'NexusAI',
  webDir: 'out',
  server: {
    url: serverUrl,
    cleartext: false,
    androidScheme: 'https',
    allowNavigation: ['nexus-ai-navy-xi.vercel.app', '*.vercel.app'],
  },
};

export default config;
