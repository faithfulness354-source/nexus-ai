import { NextRequest, NextResponse } from 'next/server';
import { getViewer, unauthorized } from '@/lib/access';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    if (!(await getViewer())) return unauthorized();

    const body = await request.json().catch(() => ({}));
    const fileName = body.fileName || body.filename || 'upload.png';
    
    const cleanName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const cloud_storage_path = `${Date.now()}-${cleanName}`;
    
    const origin = request.nextUrl.origin || 'https://nexus-ai-navy-xi.vercel.app';
    // Dynamically match whichever path variant the frontend is shouting at
    const incomingPath = request.nextUrl.pathname;
    const uploadUrl = `${origin}${incomingPath}?path=${encodeURIComponent(cloud_storage_path)}`;
    const url = `/uploads/${cloud_storage_path}`;

    return NextResponse.json({ 
      uploadUrl, 
      cloud_storage_path, 
      url, 
      isPublic: true 
    }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('POST error:', err);
    return NextResponse.json({ error: err?.message ?? 'Could not create upload URL' }, { status: 500, headers: corsHeaders });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cloudPath = searchParams.get('path');

    if (!cloudPath) {
      return NextResponse.json({ error: 'Missing upload path' }, { status: 400, headers: corsHeaders });
    }

    const buffer = Buffer.from(await request.arrayBuffer());
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, path.basename(cloudPath));
    fs.writeFileSync(filePath, buffer);

    return NextResponse.json({ success: true, url: `/uploads/${path.basename(cloudPath)}` }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('PUT error:', err);
    return NextResponse.json({ error: err?.message ?? 'Could not save file' }, { status: 500, headers: corsHeaders });
  }
}