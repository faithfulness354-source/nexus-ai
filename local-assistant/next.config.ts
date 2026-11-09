import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Local LLM / image servers run on the machine; no external image domains needed.
  reactStrictMode: true,
};

export default nextConfig;
