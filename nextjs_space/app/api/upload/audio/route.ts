export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getViewer, unauthorized } from '@/lib/access';
import { supabaseAdmin } from '@/lib/supabase/admin';

const BUCKET = 'profile-audio';
const AUDIO_LIMIT = 50 * 1024 * 1024;

function audioExtension(contentType: string, fileName: string): string | null {
  const type = contentType.toLowerCase().split(';')[0].trim();
  if (type === 'audio/mpeg' || type === 'audio/mp3') return 'mp3';
  if (type === 'audio/wav' || type === 'audio/x-wav' || type === 'audio/wave') return 'wav';
  if (type === 'audio/ogg') return 'ogg';
  if (type === 'audio/mp4' || type === 'audio/x-m4a' || type === 'audio/mp4a-latm') return 'm4a';
  if (type === 'audio/aac') return 'aac';
  if (type === 'audio/webm') return 'webm';
  if (type === 'audio/flac' || type === 'audio/x-flac') return 'flac';
  const match = fileName.toLowerCase().match(/\.(mp3|wav|ogg|m4a|aac|webm|flac)$/);
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
  if (ext === 'flac') return 'audio/flac';
  return 'audio/webm';
}

function audioName(fileName: string, ext: string): string {
  const stem = path.basename(fileName, path.extname(fileName)).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'track';
  return `${Date.now()}-${stem}.${ext}`;
}

async function ensureAudioBucket() {
  const admin = supabaseAdmin();
  if (!admin) return null;
  const existing = await admin.storage.getBucket(BUCKET);
  if (existing.error || !existing.data) {
    const created = await admin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: AUDIO_LIMIT, allowedMimeTypes: null });
    if (created.error && !/already exists/i.test(created.error.message)) {
      const open = await admin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: AUDIO_LIMIT });
      if (open.error && !/already exists/i.test(open.error.message)) throw open.error;
    }
    return admin;
  }
  const allowed = existing.data.allowed_mime_types ?? [];
  const sizeLimit = Number(existing.data.file_size_limit ?? 0);
  if (allowed.length > 0 || existing.data.public === false || sizeLimit < AUDIO_LIMIT) {
    const updated = await admin.storage.updateBucket(BUCKET, { public: true, allowedMimeTypes: null, fileSizeLimit: AUDIO_LIMIT });
    if (updated.error && !/maximum allowed size/i.test(updated.error.message)) throw updated.error;
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

function multipartFile(body: Buffer, contentType: string): { name: string; type: string; bytes: Buffer } | null {
  const found = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  const token = (found?.[1] || found?.[2] || '').trim();
  if (!token) return null;
  const marker = Buffer.from(`--${token}`);
  let cursor = 0;
  while (cursor < body.length) {
    const at = body.indexOf(marker, cursor);
    if (at < 0) return null;
    const next = body.indexOf(marker, at + marker.length);
    if (next < 0) return null;
    let start = at + marker.length;
    if (body[start] === 13 && body[start + 1] === 10) start += 2;
    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), start);
    if (headerEnd < 0 || headerEnd > next) {
      cursor = next;
      continue;
    }
    const header = body.subarray(start, headerEnd).toString('latin1');
    let end = next;
    if (body[end - 2] === 13 && body[end - 1] === 10) end -= 2;
    const nameMatch = /filename\*=UTF-8''([^\r\n;]+)|filename="([^"]*)"|filename=([^;\r\n]+)/i.exec(header);
    const name = decodeURIComponent((nameMatch?.[1] || nameMatch?.[2] || nameMatch?.[3] || '').replace(/^"|"$/g, '').trim());
    const type = /content-type:\s*([^\r\n]+)/i.exec(header)?.[1]?.trim() || '';
    if (name || /name="file"/i.test(header)) return { name: name || 'track.mp3', type, bytes: body.subarray(headerEnd + 4, end) };
    cursor = next;
  }
  return null;
}

async function storeAudio(userId: string, fileName: string, declaredType: string, bytes: Buffer) {
  const ext = audioExtension(declaredType, fileName);
  if (!ext) return NextResponse.json({ error: 'Use an mp3, wav, ogg, m4a, or aac file.' }, { status: 400 });
  if (bytes.length === 0) return NextResponse.json({ error: 'That audio file is empty.' }, { status: 400 });
  const admin = await ensureAudioBucket();
  if (admin) {
    const filePath = `audio/${userId}/${audioName(fileName, ext)}`;
    const stored = await admin.storage.from(BUCKET).upload(filePath, bytes, { contentType: audioContentType(ext, declaredType), upsert: true });
    if (stored.error) throw new Error(stored.error.message || 'Could not store that song');
    const pub = admin.storage.from(BUCKET).getPublicUrl(stored.data.path);
    if (!pub.data.publicUrl) throw new Error('Upload did not return an audio address');
    return NextResponse.json({ url: pub.data.publicUrl });
  }
  return NextResponse.json({ url: saveLocalAudio(fileName, bytes) });
}

/** Saves a profile or card track and returns a URL the profile can keep. */
export async function POST(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  try {
    const contentTypeHeader = request.headers.get('content-type') ?? '';
    if (contentTypeHeader.includes('multipart/form-data')) {
      const raw = Buffer.from(await request.arrayBuffer());
      const file = multipartFile(raw, contentTypeHeader);
      if (!file) return NextResponse.json({ error: 'Could not read that audio file. Choose it again.' }, { status: 400 });
      return await storeAudio(viewer.user.id, file.name, file.type, file.bytes);
    }
    const body = await request.json().catch(() => ({}));
    const fileName = String(body?.fileName || body?.filename || 'track.mp3');
    const contentType = String(body?.contentType || '');
    if (!audioExtension(contentType, fileName)) return NextResponse.json({ error: 'Only audio files can be used as a profile song.' }, { status: 400 });
    const signed = await signedAudioTarget(viewer.user.id, fileName, contentType);
    if (!signed) return NextResponse.json({ error: 'Could not store that song' }, { status: 500 });
    return NextResponse.json(signed);
  } catch (err: any) {
    console.error('POST /api/upload/audio error:', err);
    return NextResponse.json({ error: err?.message ?? 'Could not save audio' }, { status: 500 });
  }
}
