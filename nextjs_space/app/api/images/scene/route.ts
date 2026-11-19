export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 180;

import { NextRequest } from 'next/server';

/**
 * Legacy path kept for chat clients that still POST /api/images/scene.
 * Delegates to the fal.ai production pipeline in /api/generate-scene.
 */
export async function POST(request: NextRequest) {
  const { POST: generateScene } = await import('@/app/api/generate-scene/route');
  return generateScene(request);
}
