import type { CapacitorConfig } from '@capacitor/cli';

/** Live Next.js host the Samsung WebView opens. Override with CAPACITOR_SERVER_URL. */
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || 'http://192.168.88.5:3000';

const config: CapacitorConfig = {
  appId: 'com.nexusai.roleplay',
  appName: 'NexusAI',
  webDir: 'out',
  server: {
    url: serverUrl,
    cleartext: true,
    androidScheme: 'https',
    allowNavigation: ['192.168.88.5', 'localhost', '127.0.0.1', '10.0.2.2'],
  },
};

export default config;
