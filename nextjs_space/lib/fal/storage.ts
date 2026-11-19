import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const SCENE_RENDERS_BUCKET = 'scene-renders';
const MAX_BYTES = 12 * 1024 * 1024;

let bucketReady = false;

async function ensureSceneBucket(admin: SupabaseClient): Promise<void> {
  if (bucketReady) return;
  const existing = await admin.storage.getBucket(SCENE_RENDERS_BUCKET);
  if (existing.error || !existing.data) {
    const created = await admin.storage.createBucket(SCENE_RENDERS_BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    });
    if (created.error && !/already exists/i.test(created.error.message)) {
      throw created.error;
    }
  }
  bucketReady = true;
}

function extensionFromContentType(type: string): string {
  const t = type.toLowerCase().split(';')[0].trim();
  if (t === 'image/jpeg' || t === 'image/jpg') return 'jpg';
  if (t === 'image/webp') return 'webp';
  return 'png';
}

/**
 * Downloads a fal.ai result URL and stores it in the public `scene-renders` bucket
 * so chat history URLs never expire with fal's temporary CDN links.
 */
export async function persistSceneRender(opts: {
  falImageUrl: string;
  userId: string;
  sessionId?: string | null;
}): Promise<{ url: string; path: string }> {
  const admin = supabaseAdmin();
  if (!admin) throw new Error('Supabase storage is not configured (need SUPABASE_SERVICE_ROLE_KEY).');

  await ensureSceneBucket(admin);

  const res = await fetch(opts.falImageUrl, { signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`Failed to download fal.ai image (${res.status}).`);
  const contentType = res.headers.get('content-type') || 'image/png';
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length) throw new Error('fal.ai image download was empty.');
  if (bytes.length > MAX_BYTES) throw new Error('Generated image exceeds storage size limit.');

  const ext = extensionFromContentType(contentType);
  const folder = opts.sessionId ? `scenes/${opts.userId}/${opts.sessionId}` : `scenes/${opts.userId}`;
  const path = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  const uploaded = await admin.storage.from(SCENE_RENDERS_BUCKET).upload(path, bytes, {
    contentType: contentType.split(';')[0].trim() || 'image/png',
    upsert: false,
  });
  if (uploaded.error) throw uploaded.error;

  const pub = admin.storage.from(SCENE_RENDERS_BUCKET).getPublicUrl(uploaded.data.path);
  const url = pub.data.publicUrl;
  if (!url) throw new Error('Supabase did not return a public URL for the scene render.');
  return { url, path: uploaded.data.path };
}
