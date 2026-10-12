export const dynamic = 'force-dynamic';

import { readFileSync } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

/** Changes when this server process starts, or when a hosted deployment id is set. */
const bootKey = '__nexusLiveBoot';
const bootStore = globalThis as unknown as Record<string, number>;
const bootedAt = bootStore[bootKey] ?? Date.now();
bootStore[bootKey] = bootedAt;

function revision(): string {
  const deployed = process.env.VERCEL_DEPLOYMENT_ID?.trim() || process.env.NEXT_PUBLIC_APP_REVISION?.trim();
  if (deployed) return deployed;
  if (process.env.NODE_ENV === 'development') return `boot-${bootedAt}`;
  try {
    const id = readFileSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
    if (id) return id;
  } catch { /* no production build id on disk */ }
  return `boot-${bootedAt}`;
}

/** Public stamp the phone compares so a new deployment reloads the WebView. */
export function GET() {
  return NextResponse.json(
    { ok: true, revision: revision() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
