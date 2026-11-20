import type { CapacitorConfig } from '@capacitor/cli';

/** Production host the Samsung WebView opens. */
const LIVE_API_URL = 'https://nexus-ai-navy-xi.vercel.app';

const config: CapacitorConfig = {
  appId: 'com.nexusai.roleplay',
  appName: 'NexusAI',
  webDir: 'out',
  server: {
    url: LIVE_API_URL,
    cleartext: false,
    androidScheme: 'https',
    allowNavigation: ['nexus-ai-navy-xi.vercel.app', '*.vercel.app'],
  },
};

export default config;
