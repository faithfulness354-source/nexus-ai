/** @type {import('next').NextConfig} */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const configDir = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const onVercel = process.env.VERCEL === '1';
const mobileExport = Boolean(process.env.NEXT_OUTPUT_MODE) && !onVercel;

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: mobileExport ? process.env.NEXT_OUTPUT_MODE : undefined,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // '/' makes Vercel trace the scene route from the filesystem root and fail /_not-found.
  outputFileTracingRoot: mobileExport ? path.join(configDir, '../') : configDir,
  // Dynamic image writes must not pull public media into the serverless trace.
  outputFileTracingExcludes: {
    '*': [
      './public/nexus_assets/**/*',
      './public/splash/**/*',
      './public/uploads/**/*',
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: { unoptimized: true },
  async headers() {
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ];
    const rules = [{ source: '/:path*', headers: security }];
    // Dev chunk URLs are not content-hashed, so a cached copy outlives an edit.
    if (process.env.NODE_ENV === 'development') {
      rules.push({ source: '/_next/static/:path*', headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }] });
    } else {
      const cached = [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }];
      rules.push({ source: '/nexus_assets/:path*', headers: cached });
      rules.push({ source: '/uploads/:path*', headers: cached });
    }
    return rules;
  },
  // Next 16 blocks unlisted origins on /_next/* in dev, including the HMR websocket.
  // localhost is allowed by default; 127.0.0.1 is not.
  allowedDevOrigins: ['127.0.0.1', '192.168.88.5'],
};

const userConfigPath = path.join(configDir, 'next.config.user.json');
const userConfigAllowedKeys = { skipTrailingSlashRedirect: 'boolean', trailingSlash: 'boolean' };
if (fs.existsSync(userConfigPath)) {
  const userConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf8'));
  for (const key of Object.keys(userConfig)) {
    if (typeof userConfig[key] !== userConfigAllowedKeys[key]) {
      throw new Error(`next.config.user.json: unsupported override "${key}". Supported boolean keys: skipTrailingSlashRedirect, trailingSlash.`);
    }
    nextConfig[key] = userConfig[key];
  }
}

export default nextConfig;
