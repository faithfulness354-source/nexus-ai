import { spawnSync } from 'node:child_process';

// Prisma can parse the schema only when the database URLs are present.
// This must not replace a live URL, and it must not point production at a sqlite file.
if (!process.env.DIRECT_URL?.trim() && process.env.DATABASE_URL?.trim()) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

const production = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
if (production) {
  const missing = [
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() ? '' : 'NEXT_PUBLIC_PAYPAL_CLIENT_ID',
    process.env.PAYPAL_CLIENT_SECRET?.trim() ? '' : 'PAYPAL_CLIENT_SECRET',
  ].filter(Boolean);
  if (missing.length) {
    console.warn(`[paypal] Missing ${missing.join(' and ')}. Checkout stays unavailable until both are set.`);
  }
}

function run(command) {
  const result = spawnSync(command, { stdio: 'inherit', shell: true, env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('prisma generate');
run('next build');
