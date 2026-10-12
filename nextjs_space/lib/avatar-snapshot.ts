import { readFile } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/db';

const MAX_BYTES = 7 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function publicFile(url: string): string | null {
  let pathname = url;
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') return null;
      pathname = parsed.pathname;
    } catch {
      return null;
    }
  }
  if (!pathname.startsWith('/')) return null;
  const relative = decodeURIComponent(pathname.split('?')[0]).replace(/^\/+/, '');
  if (!relative || relative.split('/').includes('..')) return null;
  const root = path.resolve(/*turbopackIgnore: true*/ process.cwd(), 'public');
  const file = path.resolve(/*turbopackIgnore: true*/ root, relative);
  const rootKey = root.toLowerCase();
  const fileKey = file.toLowerCase();
  if (fileKey !== rootKey && !fileKey.startsWith(`${rootKey}${path.sep}`)) return null;
  return file;
}

export async function loadImage(url: string): Promise<{ mime: string; data: string } | null> {
  const dataUrl = url.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (dataUrl) {
    const data = dataUrl[2].replace(/\s/g, '');
    if (data.length > MAX_BYTES) return null;
    const mime = dataUrl[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : dataUrl[1].toLowerCase();
    return { mime, data };
  }
  const local = publicFile(url);
  if (local) {
    try {
      const buf = await readFile(/*turbopackIgnore: true*/ local);
      const mime = MIME_BY_EXT[path.extname(local).toLowerCase()];
      if (!mime || !buf.length || buf.length > MAX_BYTES) return null;
      return { mime, data: buf.toString('base64') };
    } catch {
      return null;
    }
  }
  if (!/^https?:\/\//i.test(url)) return null;
  const absolute = url;
  const res = await fetch(absolute, { headers: { 'User-Agent': 'NexusAI persona snapshot' }, signal: AbortSignal.timeout(4000) });
  if (!res.ok) return null;
  const rawMime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const mime = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
  if (!mime.startsWith('image/') || mime === 'image/svg+xml') return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_BYTES) return null;
  return { mime, data: buf.toString('base64') };
}

/** Reads an avatar once into a short text note. Empty when no key or image is available. */
export async function describeAvatar(url: string): Promise<string> {
  try {
    const image = await loadImage(url);
    if (!image) return '';
    const cfg = await prisma.providerConfig.findUnique({ where: { provider: 'GEMINI' } });
    const key = cfg?.apiKey?.trim();
    if (!key) return '';
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: 'Describe only what is visible: face, hair, skin, body shape if shown, and how the clothing fits or drapes. One compact sentence under 40 words. No names and no identity guesses.' },
            { inlineData: { mimeType: image.mime, data: image.data } },
          ],
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 120 },
      }),
    });
    if (!res.ok) return '';
    const json: any = await res.json();
    const text = (json?.candidates?.[0]?.content?.parts ?? []).map((part: any) => part?.text ?? '').join(' ');
    return text.replace(/\s+/g, ' ').trim().slice(0, 400);
  } catch (err) {
    console.error('Avatar snapshot failed:', err);
    return '';
  }
}
