export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getViewer, unauthorized } from '@/lib/access';

const MAX_BYTES = 15 * 1024 * 1024;

/** Saves a card background track into public/nexus_assets/audio and returns its public path. */
export async function POST(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an audio file.' }, { status: 400 });
    const original = file.name || 'track.mp3';
    const extMatch = original.toLowerCase().match(/\.(mp3|wav|ogg|m4a|aac|webm)$/);
    const isAudio = file.type.startsWith('audio/') || !!extMatch;
    if (!isAudio) return NextResponse.json({ error: 'Only audio files can be used as card audio.' }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That audio file is larger than 15 MB.' }, { status: 400 });

    const ext = extMatch?.[1] ?? (file.type === 'audio/mpeg' || file.type === 'audio/mp3' ? 'mp3' : 'mp3');
    const stem = path.basename(original, path.extname(original)).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'track';
    const filename = `${Date.now()}-${stem}.${ext}`;
    const dir = path.join(process.cwd(), 'public', 'nexus_assets', 'audio');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ url: `/nexus_assets/audio/${filename}` });
  } catch (err: any) {
    console.error('POST /api/upload/audio error:', err);
    return NextResponse.json({ error: err?.message ?? 'Could not save audio' }, { status: 500 });
  }
}
