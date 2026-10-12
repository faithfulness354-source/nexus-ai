import fs from 'fs';
import path from 'path';

const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function extensionForImage(contentType: string, fileName = ''): string | null {
  const fromType = IMAGE_TYPES[contentType.toLowerCase().split(';')[0].trim()];
  if (fromType) return fromType;
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp' || ext === 'gif') return ext === 'jpeg' ? 'jpg' : ext;
  return null;
}

/** Writes an image under public/uploads and returns the site path. */
export function savePublicUpload(fileName: string, body: Buffer, contentType = ''): string {
  const ext = extensionForImage(contentType, fileName);
  if (!ext) throw new Error('That file is not a supported image');
  const stem = path.basename(fileName).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-60) || 'image';
  const stored = `${Date.now()}-${stem}.${ext}`;
  const dir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), 'public', 'uploads');
  const file = path.resolve(/*turbopackIgnore: true*/ dir, stored);
  const dirKey = dir.toLowerCase();
  const fileKey = file.toLowerCase();
  if (fileKey !== dirKey && !fileKey.startsWith(`${dirKey}${path.sep}`)) throw new Error('Invalid upload path');
  fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  fs.writeFileSync(/*turbopackIgnore: true*/ file, body);
  return `/uploads/${stored}`;
}
