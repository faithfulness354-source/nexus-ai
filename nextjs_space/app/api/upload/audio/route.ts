export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getViewer, unauthorized } from '@/lib/access';
import { supabaseAdmin } from '@/lib/supabase/admin';

const MAX_BYTES = 15 * 1024 * 1024;
const BUCKET = 'card-images';
const ALLOWED_MIME = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/x-m4a',
];

function audioExtension(contentType: string, fileName: string): string | null {
  const type = contentType.toLowerCase().split(';')[0].trim();
  if (type === 'audio/mpeg' || type === 'audio/mp3') return 'mp3';
  if (type === 'audio/wav' || type === 'audio/x-wav' || type === 'audio/wave') return 'wav';
  if (type === 'audio/ogg') return 'ogg';
  if (type === 'audio/mp4' || type === 'audio/x-m4a') return 'm4a';
  if (type === 'audio/aac') return 'aac';
  if (type === 'audio/webm') return 'webm';
  const match = fileName.toLowerCase().match(/\.(mp3|wav|ogg|m4a|aac|webm)$/);
  return match?.[1] ?? null;
}

function audioContentType(ext: string, declared: string): string {
  const type = declared.toLowerCase().split(';')[0].trim();
  if (type.startsWith('audio/')) return type === 'audio/mp3' ? 'audio/mpeg' : type;
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'ogg') return 'audio/ogg';
  if (ext === 'm4a') return 'audio/mp4';
  if (ext === 'aac') return 'audio/aac';
  return 'audio/webm';
}

function audioName(fileName: string, ext: string): string {
  const stem = path.basename(fileName, path.extname(fileName)).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'track';
  return `${Date.now()}-${stem}.${ext}`;
}

async function ensureAudioBucket() {
  const admin = supabaseAdmin();
  if (!admin) return null;
  try {
    const existing = await admin.storage.getBucket(BUCKET);
    if (existing.error || !existing.data) {
      const created = await admin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 20 * 1024 * 1024, allowedMimeTypes: ALLOWED_MIME });
      if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
    } else {
      const allowed = existing.data.allowed_mime_types ?? [];
      const missingAudio = allowed.length > 0 && ALLOWED_MIME.some((type) => type.startsWith('audio/') && !allowed.includes(type));
      if (missingAudio || existing.data.public === false) {
        const updated = await admin.storage.updateBucket(BUCKET, { public: true, allowedMimeTypes: Array.from(new Set([...allowed, ...ALLOWED_MIME])), fileSizeLimit: existing.data.file_size_limit ?? 20 * 1024 * 1024 });
        if (updated.error) throw updated.error;
      }
    }
  } catch (err) {
    console.error('Audio bucket update failed:', err instanceof Error ? err.message : 'unknown');
  }
  return admin;
}

async function signedAudioTarget(userId: string, fileName: string, contentType: string) {
  const ext = audioExtension(contentType, fileName);
  if (!ext) return null;
  const admin = await ensureAudioBucket();
  if (!admin) return null;
  const filePath = `audio/${userId}/${audioName(fileName, ext)}`;
  const bucket = admin.storage.from(BUCKET);
  const signed = await bucket.createSignedUploadUrl(filePath, { upsert: true });
  if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error('Signed upload URL was empty');
  const pub = bucket.getPublicUrl(signed.data.path);
  if (!pub.data.publicUrl) throw new Error('Upload did not return an audio address');
  return { uploadUrl: signed.data.signedUrl, url: pub.data.publicUrl, provider: 'supabase' as const };
}

function saveLocalAudio(fileName: string, bytes: Buffer): string {
  const ext = audioExtension('', fileName) ?? 'mp3';
  const filename = audioName(fileName, ext);
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'nexus' + '_' + 'assets', 'audio');
  fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  fs.writeFileSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, filename), bytes);
  return `/${'nexus'}_${'assets'}/audio/${filename}`;
}

/** Saves a profile or card track and returns a URL the profile can keep. */
export async function POST(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  try {
    const contentTypeHeader = request.headers.get('content-type') ?? '';
    if (!contentTypeHeader.includes('multipart/form-data')) {
      const body = await request.json().catch(() => ({}));
      const fileName = String(body?.fileName || body?.filename || 'track.mp3');
      const contentType = String(body?.contentType || '');
      if (!audioExtension(contentType, fileName)) return NextResponse.json({ error: 'Only audio files can be used as a profile song.' }, { status: 400 });
      const signed = await signedAudioTarget(viewer.user.id, fileName, contentType);
      if (!signed) return NextResponse.json({ error: 'Could not store that song' }, { status: 500 });
      return NextResponse.json(signed);
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an audio file.' }, { status: 400 });
    const original = file.name || 'track.mp3';
    const ext = audioExtension(file.type, original);
    if (!ext) return NextResponse.json({ error: 'Only audio files can be used as card audio.' }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That audio file is larger than 15 MB.' }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const admin = await ensureAudioBucket();
    if (admin) {
      const filePath = `audio/${viewer.user.id}/${audioName(original, ext)}`;
      const stored = await admin.storage.from(BUCKET).upload(filePath, bytes, { contentType: audioContentType(ext, file.type), upsert: true });
      if (stored.error) throw new Error(stored.error.message || 'Could not store that song');
      const pub = admin.storage.from(BUCKET).getPublicUrl(stored.data.path);
      if (!pub.data.publicUrl) throw new Error('Upload did not return an audio address');
      return NextResponse.json({ url: pub.data.publicUrl });
    }
    return NextResponse.json({ url: saveLocalAudio(original, bytes) });
  } catch (err: any) {
    console.error('POST /api/upload/audio error:', err);
    return NextResponse.json({ error: err?.message ?? 'Could not save audio' }, { status: 500 });
  }
}
