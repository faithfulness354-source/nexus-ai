import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getViewer, unauthorized } from '@/lib/access';
import { generatePresignedUploadUrl, getFileUrl } from '@/lib/s3';
import { extensionForImage, savePublicUpload } from '@/lib/local-upload';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function requestOrigin(request: NextRequest): string {
  const fromNext = request.nextUrl.origin;
  if (fromNext && fromNext !== 'null') {
    try {
      const url = new URL(fromNext);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
    } catch {
      /* use the host header */
    }
  }
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') ?? 'http';
  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

const CARD_IMAGES = 'card-images';
let cardImagesReady = false;

function safeStem(fileName: string): string {
  return path.basename(fileName).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-60) || 'image';
}

const MEDIA_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];

function mediaExtension(contentType: string, fileName: string): string | null {
  const image = extensionForImage(contentType, fileName);
  if (image) return image;
  const type = contentType.toLowerCase().split(';')[0].trim();
  if (type === 'video/mp4') return 'mp4';
  if (type === 'video/webm') return 'webm';
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'mp4' || ext === 'webm') return ext;
  return null;
}

function imageObjectPath(userId: string, fileName: string, contentType: string): string {
  const ext = mediaExtension(contentType, fileName) || 'png';
  return `cards/${userId}/${crypto.randomUUID()}-${safeStem(fileName)}.${ext}`;
}

async function ensureCardImagesBucket(admin: SupabaseClient) {
  if (cardImagesReady) return;
  const existing = await admin.storage.getBucket(CARD_IMAGES);
  if (existing.error || !existing.data) {
    const created = await admin.storage.createBucket(CARD_IMAGES, {
      public: true,
      fileSizeLimit: 20 * 1024 * 1024,
      allowedMimeTypes: MEDIA_MIME,
    });
    if (created.error && !/already exists/i.test(created.error.message)) {
      console.error('Upload URL Generation Error:', created.error);
      throw created.error;
    }
  } else {
    const updated = await admin.storage.updateBucket(CARD_IMAGES, { public: true, allowedMimeTypes: MEDIA_MIME, fileSizeLimit: 20 * 1024 * 1024 });
    if (updated.error) {
      console.error('Upload URL Generation Error:', updated.error);
      throw updated.error;
    }
  }
  cardImagesReady = true;
}

async function supabaseUploadTarget(userId: string, fileName: string, contentType: string) {
  const admin = supabaseAdmin();
  if (!admin) return null;
  await ensureCardImagesBucket(admin);
  const filePath = imageObjectPath(userId, fileName, contentType);
  const bucket = admin.storage.from(CARD_IMAGES);
  const signed = await bucket.createSignedUploadUrl(filePath, { upsert: true });
  if (signed.error || !signed.data?.signedUrl) {
    console.error('Upload URL Generation Error:', signed.error);
    throw signed.error ?? new Error('Signed upload URL was empty');
  }
  const pub = bucket.getPublicUrl(signed.data.path);
  if (!pub.data.publicUrl) throw new Error('Upload did not return an image address');
  return {
    uploadUrl: signed.data.signedUrl,
    token: signed.data.token,
    cloud_storage_path: signed.data.path,
    url: pub.data.publicUrl,
    isPublic: true,
    provider: 'supabase' as const,
  };
}

async function cloudTarget(fileName: string, contentType: string) {
  if (!process.env.AWS_BUCKET_NAME?.trim()) return null;
  try {
    const signed = await generatePresignedUploadUrl(fileName, contentType, true);
    const url = await getFileUrl(signed.cloud_storage_path, contentType, true);
    const upload = new URL(signed.uploadUrl);
    const saved = new URL(url);
    if (upload.protocol !== 'https:' && upload.protocol !== 'http:') return null;
    if (saved.protocol !== 'https:' && saved.protocol !== 'http:') return null;
    return { uploadUrl: upload.toString(), cloud_storage_path: signed.cloud_storage_path, url: saved.toString(), isPublic: true };
  } catch (err) {
    console.error('Cloud image upload unavailable:', err instanceof Error ? err.name : 'Error');
    return null;
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const viewer = await getViewer();
    if (!viewer) return unauthorized();
    const contentTypeHeader = request.headers.get('content-type') ?? '';

    if (contentTypeHeader.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return NextResponse.json({ error: 'No image was uploaded' }, { status: 400, headers: corsHeaders });
      const contentType = file.type || 'application/octet-stream';
      if (!mediaExtension(contentType, file.name)) {
        return NextResponse.json({ error: 'That file is not a supported image or short video' }, { status: 400, headers: corsHeaders });
      }
      const admin = supabaseAdmin();
      if (admin) {
        await ensureCardImagesBucket(admin);
        const filePath = imageObjectPath(viewer.user.id, file.name || 'image.png', contentType);
        const stored = await admin.storage.from(CARD_IMAGES).upload(filePath, Buffer.from(await file.arrayBuffer()), {
          contentType,
          upsert: true,
        });
        if (stored.error) {
          console.error('Upload URL Generation Error:', stored.error);
          return NextResponse.json({ error: 'Could not create upload URL', code: 'UPLOAD_URL_FAILED' }, { status: 500, headers: corsHeaders });
        }
        const pub = admin.storage.from(CARD_IMAGES).getPublicUrl(stored.data.path);
        const publicUrl = pub.data.publicUrl;
        if (!publicUrl) {
          return NextResponse.json({ error: 'Upload did not return an image address' }, { status: 500, headers: corsHeaders });
        }
        return NextResponse.json({
          uploadUrl: '',
          cloud_storage_path: stored.data.path,
          url: publicUrl,
          isPublic: true,
          provider: 'supabase',
        }, { headers: corsHeaders });
      }
      const url = savePublicUpload(file.name || 'image.png', Buffer.from(await file.arrayBuffer()), contentType);
      return NextResponse.json({ uploadUrl: '', cloud_storage_path: url.slice(1), url, isPublic: true }, { headers: corsHeaders });
    }

    const body = await request.json().catch(() => ({}));
    const fileName = String(body.fileName || body.filename || 'upload.png');
    const contentType = String(body.contentType || 'image/png');
    if (!mediaExtension(contentType, fileName)) {
      return NextResponse.json({ error: 'That file is not a supported image or short video' }, { status: 400, headers: corsHeaders });
    }

    const supabase = await supabaseUploadTarget(viewer.user.id, fileName, contentType);
    if (supabase) return NextResponse.json(supabase, { headers: corsHeaders });

    const cloud = await cloudTarget(fileName, contentType);
    if (cloud) return NextResponse.json(cloud, { headers: corsHeaders });

    const cleanName = path.basename(fileName).replace(/[^a-zA-Z0-9.-]/g, '_');
    const cloud_storage_path = `${Date.now()}-${cleanName}`;
    const origin = requestOrigin(request);
    const uploadUrl = new URL(`${request.nextUrl.pathname}?path=${encodeURIComponent(cloud_storage_path)}`, origin).toString();
    return NextResponse.json({
      uploadUrl,
      cloud_storage_path,
      url: `/uploads/${cloud_storage_path}`,
      isPublic: true,
    }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('Upload URL Generation Error:', err);
    return NextResponse.json({ error: 'Could not create upload URL', code: 'UPLOAD_URL_FAILED' }, { status: 500, headers: corsHeaders });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const cloudPath = request.nextUrl.searchParams.get('path');
    if (!cloudPath) return NextResponse.json({ error: 'Missing upload path' }, { status: 400, headers: corsHeaders });
    const stored = path.basename(cloudPath);
    if (!stored || stored !== cloudPath.replace(/\\/g, '/').split('/').pop()) {
      return NextResponse.json({ error: 'Invalid upload path' }, { status: 400, headers: corsHeaders });
    }
    const buffer = Buffer.from(await request.arrayBuffer());
    const uploadDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), 'public', 'uploads');
    const filePath = path.resolve(/*turbopackIgnore: true*/ uploadDir, stored);
    const dirKey = uploadDir.toLowerCase();
    const fileKey = filePath.toLowerCase();
    if (fileKey !== dirKey && !fileKey.startsWith(`${dirKey}${path.sep}`)) {
      return NextResponse.json({ error: 'Invalid upload path' }, { status: 400, headers: corsHeaders });
    }
    fs.mkdirSync(/*turbopackIgnore: true*/ uploadDir, { recursive: true });
    fs.writeFileSync(/*turbopackIgnore: true*/ filePath, buffer);
    return NextResponse.json({ success: true, url: `/uploads/${stored}` }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('PUT upload error:', err instanceof Error ? err.name : 'Error');
    return NextResponse.json({ error: 'Could not save file' }, { status: 500, headers: corsHeaders });
  }
}
