import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getViewer, unauthorized } from '@/lib/access';
import { generatePresignedUploadUrl, getFileUrl } from '@/lib/s3';
import { extensionForImage, savePublicUpload } from '@/lib/local-upload';

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
    if (!(await getViewer())) return unauthorized();
    const contentTypeHeader = request.headers.get('content-type') ?? '';

    if (contentTypeHeader.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return NextResponse.json({ error: 'No image was uploaded' }, { status: 400, headers: corsHeaders });
      const contentType = file.type || 'application/octet-stream';
      if (!extensionForImage(contentType, file.name)) {
        return NextResponse.json({ error: 'That file is not a supported image' }, { status: 400, headers: corsHeaders });
      }
      const url = savePublicUpload(file.name || 'image.png', Buffer.from(await file.arrayBuffer()), contentType);
      return NextResponse.json({ uploadUrl: '', cloud_storage_path: url.slice(1), url, isPublic: true }, { headers: corsHeaders });
    }

    const body = await request.json().catch(() => ({}));
    const fileName = String(body.fileName || body.filename || 'upload.png');
    const contentType = String(body.contentType || 'image/png');
    if (!extensionForImage(contentType, fileName)) {
      return NextResponse.json({ error: 'That file is not a supported image' }, { status: 400, headers: corsHeaders });
    }

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
    console.error('POST upload error:', err instanceof Error ? err.name : 'Error');
    return NextResponse.json({ error: 'Could not create upload URL' }, { status: 500, headers: corsHeaders });
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
    const uploadDir = path.resolve(process.cwd(), 'public', 'uploads');
    const filePath = path.resolve(uploadDir, stored);
    const dirKey = uploadDir.toLowerCase();
    const fileKey = filePath.toLowerCase();
    if (fileKey !== dirKey && !fileKey.startsWith(`${dirKey}${path.sep}`)) {
      return NextResponse.json({ error: 'Invalid upload path' }, { status: 400, headers: corsHeaders });
    }
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(filePath, buffer);
    return NextResponse.json({ success: true, url: `/uploads/${stored}` }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('PUT upload error:', err instanceof Error ? err.name : 'Error');
    return NextResponse.json({ error: 'Could not save file' }, { status: 500, headers: corsHeaders });
  }
}
