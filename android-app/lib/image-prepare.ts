'use client';

/** Longest edge after client-side prepare. Keeps clarity without huge uploads. */
export const CARD_IMAGE_MAX_DIMENSION = 1200;
/** Soft size target after compress. Oversized originals are re-encoded down to this. */
export const CARD_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

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
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 15_000);
    canvas.toBlob((blob) => {
      clearTimeout(timer);
      resolve(blob);
    }, type, quality);
  });
}

function fileFromBlob(blob: Blob, baseName: string, width: number, height: number): File {
  const subtype = blob.type.split('/')[1] === 'jpeg' ? 'jpg' : blob.type.split('/')[1] || 'webp';
  const base = baseName.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${base}-${width}x${height}.${subtype}`, { type: blob.type });
}

/**
 * Client-side prepare for character card uploads:
 * - preserves aspect ratio (no centre-crop)
 * - scales down so the longest edge is at most `maxDimension`
 * - re-encodes until the file is under `maxBytes` when possible
 * GIFs are left alone so animation survives.
 */
export async function prepareImageForUpload(
  file: File,
  opts?: { maxDimension?: number; maxBytes?: number },
): Promise<File> {
  const maxDimension = opts?.maxDimension ?? CARD_IMAGE_MAX_DIMENSION;
  const maxBytes = opts?.maxBytes ?? CARD_IMAGE_MAX_BYTES;

  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file;
  }

  try {
    const img = await loadImage(file);
    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    if (!sw || !sh) return file;

    const scale = Math.min(1, maxDimension / Math.max(sw, sh));
    const ow = Math.max(1, Math.round(sw * scale));
    const oh = Math.max(1, Math.round(sh * scale));
    const alreadyFits = scale === 1 && file.size <= maxBytes;

    // Small enough already — keep original bytes (PNG transparency, EXIF, etc.).
    if (alreadyFits) return file;

    const canvas = document.createElement('canvas');
    canvas.width = ow;
    canvas.height = oh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, ow, oh);

    const keepPng = file.type === 'image/png';
    const baseName = file.name || 'image';

    if (keepPng) {
      // Prefer PNG when under budget; otherwise fall through to lossy for the size cap.
      const png = await canvasToBlob(canvas, 'image/png');
      if (png && png.size <= maxBytes) return fileFromBlob(png, baseName, ow, oh);
    }

    // Lossy path: try WebP then JPEG, stepping quality down until under maxBytes.
    for (const type of ['image/webp', 'image/jpeg'] as const) {
      let best: Blob | null = null;
      for (const quality of [0.92, 0.85, 0.78, 0.7, 0.62, 0.55]) {
        const blob = await canvasToBlob(canvas, type, quality);
        if (!blob) continue;
        if (type === 'image/webp' && blob.type !== 'image/webp') break;
        best = blob;
        if (blob.size <= maxBytes) return fileFromBlob(blob, baseName, ow, oh);
      }
      if (best) return fileFromBlob(best, baseName, ow, oh);
    }

    return file;
  } catch (err) {
    console.error('Image prepare failed, uploading original:', err);
    return file;
  }
}
