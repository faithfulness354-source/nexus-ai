'use client';

/** Target crops for character imagery. */
export const CROP_PRESETS = {
  avatar: { aspect: 1, maxSize: 1024 },      // 1:1 portrait
  card: { aspect: 2 / 3, maxSize: 1200 },     // 2:3 gallery / card portrait
  banner: { aspect: 16 / 10, maxSize: 1600 }, // wide gallery-card banner
} as const;

export type CropPreset = keyof typeof CROP_PRESETS;
export interface CropOptions { aspect: number; maxSize: number }

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await Promise.race([
      img.decode(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Image processing timed out')), 15_000)),
    ]);
    return img;
  } finally {
    // Safe to revoke once decoded; the bitmap stays in memory.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function blobFromCanvas(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 15_000);
    canvas.toBlob((blob) => {
      clearTimeout(timer);
      resolve(blob);
    }, type, 0.92);
  });
}

/**
 * Centre-crops an image to `aspect` (width / height) and scales it down so its longest edge is
 * at most `maxSize`. Never upscales (no blur) and never stretches: the crop keeps the source
 * pixel ratio, exactly like `object-fit: cover` centred. GIFs are returned unchanged to keep
 * animation; any failure falls back to the original file.
 */
export async function cropToAspect(file: File, { aspect, maxSize }: CropOptions): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  try {
    const img = await loadImage(file);
    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    if (!sw || !sh) return file;

    // Largest centred rectangle with the target aspect.
    let cw = sw;
    let ch = Math.round(sw / aspect);
    if (ch > sh) { ch = sh; cw = Math.round(sh * aspect); }
    const cx = Math.round((sw - cw) / 2);
    const cy = Math.round((sh - ch) / 2);

    // Downscale only.
    const scale = Math.min(1, maxSize / Math.max(cw, ch));
    const ow = Math.max(1, Math.round(cw * scale));
    const oh = Math.max(1, Math.round(ch * scale));

    // Already the right shape and size: keep the original bytes (zero quality loss).
    if (cx === 0 && cy === 0 && scale === 1 && Math.abs(sw / sh - aspect) < 0.005) return file;

    const canvas = document.createElement('canvas');
    canvas.width = ow;
    canvas.height = oh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, cx, cy, cw, ch, 0, 0, ow, oh);

    // Keep PNG for transparency; everything else becomes high-quality WebP (JPEG fallback).
    const keepPng = file.type === 'image/png';
    const type = keepPng ? 'image/png' : 'image/webp';
    let blob = await blobFromCanvas(canvas, type);
    if (!blob || (!keepPng && blob.type !== 'image/webp')) {
      blob = await blobFromCanvas(canvas, 'image/jpeg');
    }
    if (!blob) return file;
    const ext = blob.type.split('/')[1] === 'jpeg' ? 'jpg' : blob.type.split('/')[1];
    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${base}-${ow}x${oh}.${ext}`, { type: blob.type });
  } catch (err) {
    console.error('Image crop failed, uploading original:', err);
    return file;
  }
}
