/** @type {import('next').NextConfig} */
const path = require('path');

const onVercel = process.env.VERCEL === '1';
const mobileExport = Boolean(process.env.NEXT_OUTPUT_MODE) && !onVercel;

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: mobileExport ? process.env.NEXT_OUTPUT_MODE : undefined,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // '/' makes Vercel trace the scene route from the filesystem root and fail /_not-found.
  outputFileTracingRoot: mobileExport ? path.join(__dirname, '../') : __dirname,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: { unoptimized: true },
  // Dev chunk URLs are not content-hashed, so a cached copy outlives an edit.
  async headers() {
    if (process.env.NODE_ENV !== 'development') return [];
    return [{ source: '/_next/static/:path*', headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }] }];
  },
  // Next 16 blocks unlisted origins on /_next/* in dev, including the HMR websocket.
  // localhost is allowed by default; 127.0.0.1 is not.
  allowedDevOrigins: ['127.0.0.1', '192.168.88.5'],
};

const fs = require('fs');
const userConfigPath = path.join(__dirname, 'next.config.user.json');
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

module.exports = nextConfig;

