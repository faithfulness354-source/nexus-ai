import { readFile } from 'fs/promises';
import path from 'path';
import type { GalleryImage } from '@/lib/types';
import { generateComfyScene } from '@/src/lib/comfy/client';

const STOP_WORDS = new Set(['character', 'the', 'and', 'with', 'image', 'reference', 'ref', 'portrait', 'photo', 'pic']);
const MAX_REFS = 3;
const MAX_REF_BYTES = 7 * 1024 * 1024;

export interface SceneCharacter { name: string; avatar: string | null; gallery: unknown; nsfw?: boolean }

export function parseGallery(raw: unknown): GalleryImage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((g: any) => g && typeof g.url === 'string' && g.url) as GalleryImage[];
}

function words(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Choose which gallery images condition the render: label matches first, then the primary portrait. */
export function pickReferences(character: SceneCharacter, description: string): { url: string; label: string }[] {
  const gallery = parseGallery(character.gallery);
  const desc = description.toLowerCase();
  const descWords = new Set(words(description));
  const scored = gallery.map((g, i) => {
    const label = (g.label || '').trim();
    let score = label && desc.includes(label.toLowerCase()) ? 10 : 0;
    for (const w of words(label)) if (descWords.has(w)) score += 2;
    return { g, i, score };
  });
  const picked = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.i - b.i).map((s) => s.g);
  if (picked.length === 0 && gallery[0]) picked.push(gallery[0]);
  const refs = picked.slice(0, MAX_REFS).map((g) => ({ url: g.url, label: g.label || character.name }));
  if (refs.length === 0 && character.avatar) refs.push({ url: character.avatar, label: character.name });
  return refs;
}

function publicPortrait(url: string): string | null {
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
  const root = path.resolve(process.cwd(), 'public');
  const file = path.resolve(root, relative);
  const rootKey = root.toLowerCase();
  const fileKey = file.toLowerCase();
  if (fileKey !== rootKey && !fileKey.startsWith(`${rootKey}${path.sep}`)) return null;
  return file;
}

async function loadPortrait(url: string): Promise<Buffer | null> {
  if (url.startsWith('data:')) {
    const match = url.match(/^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/i);
    if (!match) return null;
    const data = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
    return data.length && data.length <= MAX_REF_BYTES ? data : null;
  }
  const local = publicPortrait(url);
  if (local) {
    try {
      const data = await readFile(local);
      return data.length && data.length <= MAX_REF_BYTES ? data : null;
    } catch {
      return null;
    }
  }
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = Buffer.from(await res.arrayBuffer());
    return data.length && data.length <= MAX_REF_BYTES ? data : null;
  } catch {
    return null;
  }
}

/** Renders a scene in ComfyUI, using the card portrait so the character stays recognizable. */
export async function renderSceneImage(character: SceneCharacter, description: string) {
  const portrait = character.avatar
    ? { url: character.avatar, label: character.name }
    : pickReferences(character, description)[0] ?? null;
  if (!portrait) throw new Error('This card has no portrait to match.');
  const reference = await loadPortrait(portrait.url);
  if (!reference) throw new Error('The card portrait could not be loaded for ComfyUI.');
  const url = await generateComfyScene(description, character.name?.trim() || portrait.label || 'Character', reference, !!character.nsfw);
  return { url, cloud_storage_path: url, engine: 'comfyui', referencesUsed: [portrait.label || character.name] };
}
