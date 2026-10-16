'use client';

import { cropToAspect, CROP_PRESETS, type CropPreset } from './image-crop';

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
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://nexus-ai-navy-xi.vercel.app';
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
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('..') && !raw.includes('\\')) return raw;
  return httpUrl(raw)?.toString() ?? '';
}

const UPLOAD_TIMEOUT_MS = 15_000;

function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPLOAD_TIMEOUT_MS);
  return fetch(input, { ...init, signal: ctrl.signal }).catch((err: unknown) => {
    if (err instanceof DOMException && err.name === 'AbortError') throw new Error('Upload timed out. Try again.');
    throw err;
  }).finally(() => clearTimeout(timer));
}

/** Bytes on the wire. Never a base64 string. */
async function asUploadBlob(file: File): Promise<Blob> {
  const bytes = await file.arrayBuffer();
  return new Blob([bytes], { type: file.type || 'application/octet-stream' });
}

async function uploadDirect(file: File): Promise<{ url: string; cloud_storage_path: string; isPublic: boolean }> {
  const blob = await asUploadBlob(file);
  const body = new FormData();
  body.append('file', blob, file.name || 'image.png');
  const res = await fetchWithTimeout('/api/upload/presigned', { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  const url = publicImageUrl(data?.url);
  if (!res.ok || !url) throw new Error(typeof data?.error === 'string' ? data.error : 'Upload failed');
  return { url, cloud_storage_path: String(data?.cloud_storage_path ?? ''), isPublic: true };
}

async function createUploadUrl(file: File): Promise<any> {
  const res = await fetchWithTimeout('/api/upload/presigned', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name || 'image.png', contentType: file.type || 'image/png' }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Sign in to upload images');
  }
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Could not create upload URL');
  }
  return data;
}

async function putSignedFile(uploadUrl: string, file: File): Promise<void> {
  const blob = await asUploadBlob(file);
  const body = new FormData();
  body.append('cacheControl', '3600');
  body.append('', blob, file.name || 'image.png');
  const put = await fetchWithTimeout(uploadUrl, { method: 'PUT', headers: { 'x-upsert': 'true' }, body });
  if (!put.ok) throw new Error('Could not store the image');
}

/**
 * Uploads an image and returns its public URL.
 * Pass `crop` to auto centre-crop + downscale it to a card aspect before upload.
 * A local file is saved even when the cloud upload address is missing or not a URL.
 */
export async function uploadImage(input: File, crop?: CropPreset): Promise<{ url: string; cloud_storage_path: string; isPublic: boolean }> {
  const contentType = imageType(input);
  if (!contentType) throw new Error(`${input.name || 'That file'} is not an image`);
  if (input.size > MAX_IMAGE_BYTES) throw new Error(`${input.name || 'That file'} is larger than 20 MB`);
  const file = crop ? await cropToAspect(input, CROP_PRESETS[crop]) : input;
  const typed = file.type === contentType ? file : new File([file], file.name || 'image.png', { type: contentType });

  try {
    const data = await createUploadUrl(typed);
    const savedUrl = publicImageUrl(data?.url);
    const target = httpUrl(data?.uploadUrl);
    if (data?.provider === 'supabase') {
      if (!target) throw new Error('Could not create upload URL');
      await putSignedFile(target.toString(), typed);
      if (!savedUrl) throw new Error('Upload did not return an image address');
      return { url: savedUrl, cloud_storage_path: String(data?.cloud_storage_path ?? ''), isPublic: true };
    }
    if (!target) {
      if (savedUrl) return { url: savedUrl, cloud_storage_path: String(data?.cloud_storage_path ?? ''), isPublic: true };
      return uploadDirect(typed);
    }
    const signed = target.searchParams.get('X-Amz-SignedHeaders') ?? '';
    const headers: Record<string, string> = { 'Content-Type': typed.type || contentType };
    if (signed.includes('content-disposition')) headers['Content-Disposition'] = 'attachment';
    const put = await fetchWithTimeout(target.toString(), { method: 'PUT', headers, body: await asUploadBlob(typed) });
    if (!put.ok) return uploadDirect(typed);
    if (!savedUrl) throw new Error('Upload did not return an image address');
    return { url: savedUrl, cloud_storage_path: String(data?.cloud_storage_path ?? ''), isPublic: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (
      message === 'Sign in to upload images'
      || message === 'Upload did not return an image address'
      || message === 'Could not create upload URL'
      || message === 'Could not store the image'
      || message === 'Upload timed out. Try again.'
    ) throw err instanceof Error ? err : new Error('Could not create upload URL');
    try {
      return await uploadDirect(typed);
    } catch (directErr) {
      const directMessage = directErr instanceof Error ? directErr.message : '';
      if (directMessage === 'Could not create upload URL' || directMessage === 'Sign in to upload images') throw directErr;
      throw new Error(directMessage || 'Could not create upload URL');
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
  flac: 'audio/flac',
};

function audioUploadError(detail: string): string {
  if (/maximum allowed size|exceeded the maximum/i.test(detail)) return 'That audio file is larger than 50 MB. This project cannot store a bigger file.';
  try {
    const parsed = JSON.parse(detail);
    if (typeof parsed?.message === 'string' && parsed.message.trim()) return parsed.message.trim();
  } catch {
    /* response was plain text */
  }
  return 'Could not store that song';
}

/** Sends the file bytes themselves. A FormData body is what the phone storage call rejects. */
async function putSignedAudio(uploadUrl: string, bytes: ArrayBuffer, contentType: string): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'cache-control': 'max-age=3600',
        'x-upsert': 'true',
      },
      body: bytes,
      signal: ctrl.signal,
    });
    if (put.ok) return;
    const detail = (await put.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 300);
    throw new Error(audioUploadError(detail));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new Error('Upload timed out. Try again.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Uploads a profile song and returns the address that should be saved on the profile. */
export async function uploadProfileAudio(file: File): Promise<{ url: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const declared = file.type.toLowerCase().split(';')[0].trim();
  const knownExt = AUDIO_TYPES[ext] ? ext : '';
  const contentType = knownExt
    ? AUDIO_TYPES[knownExt]
    : declared === 'audio/mp3' || declared === 'audio/mpeg'
      ? 'audio/mpeg'
      : declared === 'audio/mp4' || declared === 'audio/x-m4a' || declared === 'audio/mp4a-latm' || declared === 'audio/aac'
        ? 'audio/mp4'
        : declared === 'audio/flac' || declared === 'audio/x-flac'
          ? 'audio/flac'
          : declared.startsWith('audio/')
            ? declared
            : '';
  if (!contentType) throw new Error('Use an mp3, wav, ogg, m4a, or flac file');
  const safeExt = knownExt || (contentType === 'audio/mp4' ? 'm4a' : contentType === 'audio/wav' || contentType === 'audio/x-wav' ? 'wav' : contentType === 'audio/ogg' ? 'ogg' : contentType === 'audio/webm' ? 'webm' : contentType === 'audio/aac' ? 'aac' : contentType === 'audio/flac' || contentType === 'audio/x-flac' ? 'flac' : 'mp3');
  const named = knownExt ? file.name : `track.${safeExt}`;
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength === 0) throw new Error('That audio file is empty');
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
    try {
      await putSignedAudio(target.toString(), bytes, contentType);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (!/mime type/i.test(message) || contentType === 'audio/mpeg') throw err;
      await putSignedAudio(target.toString(), bytes, 'audio/mpeg');
    }
  }
  return { url };
}

/** Uploads an MP4 or WebM backdrop. Clips longer than 10 seconds are refused. */
export async function uploadProfileVideo(file: File): Promise<{ url: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const contentType = file.type === 'video/webm' || ext === 'webm' ? 'video/webm' : file.type === 'video/mp4' || ext === 'mp4' ? 'video/mp4' : '';
  if (!contentType) throw new Error('Use an MP4 or WebM file');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('That video is larger than 20 MB');
  const duration = await new Promise<number>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    const timer = setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Upload timed out. Try again.'));
    }, UPLOAD_TIMEOUT_MS);
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      const length = video.duration;
      URL.revokeObjectURL(objectUrl);
      resolve(length);
    };
    video.onerror = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read that video'));
    };
    video.src = objectUrl;
  });
  if (!Number.isFinite(duration) || duration > 10.5) throw new Error('Background videos must be 10 seconds or shorter');
  const typed = new File([file], file.name || 'loop.mp4', { type: contentType });
  const data = await createUploadUrl(typed);
  const savedUrl = publicImageUrl(data?.url);
  const target = httpUrl(data?.uploadUrl);
  if (!target || !savedUrl) throw new Error('Could not create upload URL');
  if (data?.provider === 'supabase') await putSignedFile(target.toString(), typed);
  else {
    const put = await fetchWithTimeout(target.toString(), { method: 'PUT', headers: { 'Content-Type': contentType }, body: await asUploadBlob(typed) });
    if (!put.ok) throw new Error('Could not store the image');
  }
  return { url: savedUrl };
}
