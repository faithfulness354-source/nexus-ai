/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  output: 'export',
  distDir: 'out',
  // The module junction points at the desktop app. Turbopack only follows it
  // when that folder sits inside the configured root.
  turbopack: {
    root: path.join(__dirname, '..'),
  },
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: { unoptimized: true },
  trailingSlash: true,
};

module.exports = nextConfig;
