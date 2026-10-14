'use client';

import { cropToAspect, CROP_PRESETS, type CropPreset } from './image-crop';
import { apiOrigin } from './cloud-bridge';

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

function imageType(file: File): string {
  const declared = file.type.toLowerCase();
  if (declared.startsWith('image/') && declared !== 'image/svg+xml') return declared;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_TYPES[ext] ?? '';
}

/** Accepts absolute http(s) URLs and same-site paths. Local disk paths are not URLs. */
function httpUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.startsWith('file:') || /^[a-zA-Z]:[\\/]/.test(raw)) return null;
  const base = apiOrigin();
  try {
    const url = new URL(raw, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

function publicImageUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('..') && !raw.includes('\\')) {
    const origin = apiOrigin();
    return origin ? `${origin}${raw}` : raw;
  }
  return httpUrl(raw)?.toString() ?? '';
}

function sniffedImage(value: string): string {
  if (value.startsWith('data:image/')) return value;
  const comma = value.indexOf(',');
  const head = comma >= 0 ? value.slice(comma + 1, comma + 8) : '';
  const mime = head.startsWith('iVBOR') ? 'image/png'
    : head.startsWith('/9j/') ? 'image/jpeg'
    : head.startsWith('UklGR') ? 'image/webp'
    : head.startsWith('R0lGO') ? 'image/gif'
    : '';
  return mime ? `data:${mime};base64,${value.slice(comma + 1)}` : '';
}

/** Reads a device file without parsing its path as a URL. */
export function readDeviceImage(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === 'string' ? reader.result : '';
      const image = sniffedImage(raw);
      if (image) resolve(image);
      else reject(new Error('Could not read that image'));
    };
    reader.onerror = () => reject(new Error('Could not read that image'));
    reader.readAsDataURL(file);
  });
}

async function uploadDirect(file: File): Promise<{ url: string; cloud_storage_path: string; isPublic: boolean }> {
  const body = new FormData();
  body.append('file', file, file.name || 'image.png');
  const res = await fetch('/api/upload/presigned', { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  const url = publicImageUrl(data?.url);
  if (!res.ok || !url) throw new Error(typeof data?.error === 'string' ? data.error : 'Upload failed');
  return { url, cloud_storage_path: String(data?.cloud_storage_path ?? ''), isPublic: true };
}

/**
 * Uploads an image to the shared server and returns its public URL.
 * A local file is saved even when the upload address is missing or not a URL.
 */
export async function uploadImage(input: File, crop?: CropPreset): Promise<{ url: string; cloud_storage_path: string; isPublic: boolean }> {
  if (!(input instanceof Blob)) throw new Error('Choose an image file');
  const contentType = imageType(input);
  if (!contentType) throw new Error(`${input.name || 'That file'} is not an image`);
  if (input.size > MAX_IMAGE_BYTES) throw new Error(`${input.name || 'That file'} is larger than 20 MB`);
  const file = crop ? await cropToAspect(input, CROP_PRESETS[crop]) : input;
  const typed = file.type === contentType ? file : new File([file], file.name || 'image.png', { type: contentType });

  try {
    const res = await fetch('/api/upload/presigned', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: typed.name || 'image.png', contentType }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(typeof data?.error === 'string' ? data.error : 'Sign in to upload images');
    if (!res.ok) return uploadDirect(typed);
    const target = httpUrl(data?.uploadUrl);
    const savedUrl = publicImageUrl(data?.url);
    if (!target) return savedUrl ? { url: savedUrl, cloud_storage_path: String(data?.cloud_storage_path ?? ''), isPublic: true } : uploadDirect(typed);
    const signed = target.searchParams.get('X-Amz-SignedHeaders') ?? '';
    const headers: Record<string, string> = { 'Content-Type': typed.type || contentType };
    if (signed.includes('content-disposition')) headers['Content-Disposition'] = 'attachment';
    const put = await fetch(target.toString(), { method: 'PUT', headers, body: typed });
    if (!put.ok) return uploadDirect(typed);
    if (!savedUrl) throw new Error('Upload did not return an image address');
    return { url: savedUrl, cloud_storage_path: String(data?.cloud_storage_path ?? ''), isPublic: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'Sign in to upload images' || message === 'Upload did not return an image address') throw err;
    try {
      return await uploadDirect(typed);
    } catch {
      return { url: await readDeviceImage(typed), cloud_storage_path: '', isPublic: true };
    }
  }
}

const AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  webm: 'audio/webm',
};

/** Uploads a profile song and returns the address that should be saved on the profile. */
export async function uploadProfileAudio(file: File): Promise<{ url: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const declared = file.type.toLowerCase().split(';')[0].trim();
  const contentType = declared.startsWith('audio/') ? (declared === 'audio/mp3' ? 'audio/mpeg' : declared) : AUDIO_TYPES[ext] ?? '';
  if (!contentType) throw new Error('Use an mp3, wav, ogg, m4a, or aac file');
  if (file.size > 15 * 1024 * 1024) throw new Error('That audio file is larger than 15 MB');
  const named = file.name && AUDIO_TYPES[ext] ? file.name : `track.${ext || 'mp3'}`;
  const res = await fetch('/api/upload/audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: named, contentType }),
  });
  const data = await res.json().catch(() => ({}));
  const url = publicImageUrl(data?.url);
  if (!res.ok || !url) throw new Error(typeof data?.error === 'string' ? data.error : 'Could not upload that song');
  const target = httpUrl(data?.uploadUrl);
  if (data?.provider === 'supabase') {
    if (!target) throw new Error('Could not store that song');
    const body = new FormData();
    body.append('cacheControl', '3600');
    body.append('', file, named);
    const put = await fetch(target.toString(), { method: 'PUT', headers: { 'x-upsert': 'true' }, body });
    if (!put.ok) throw new Error('Could not store that song');
  }
  return { url };
}

/** Uses the photo already on the device. A web address is not required. */
export async function imageForCard(file: File, crop?: CropPreset): Promise<{ url: string; cloud_storage_path: string; isPublic: boolean }> {
  if (!(file instanceof Blob)) throw new Error('Choose an image file');
  let prepared: Blob = file;
  if (crop) {
    try {
      prepared = await cropToAspect(file, CROP_PRESETS[crop]);
    } catch {
      prepared = file;
    }
  }
  return { url: await readDeviceImage(prepared), cloud_storage_path: '', isPublic: true };
}
