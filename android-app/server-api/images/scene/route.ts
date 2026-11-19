export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 180;

import { NextRequest } from 'next/server';

/** Legacy path — delegates to the fal.ai generate-scene pipeline. */
export async function POST(request: NextRequest) {
  const { POST: generateScene } = await import('../../generate-scene/route');
  return generateScene(request);
}
