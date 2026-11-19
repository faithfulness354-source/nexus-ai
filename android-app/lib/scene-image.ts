import 'server-only';
import type { GalleryImage } from '@/lib/types';
import { falConfigured, generateFalScene } from '@/lib/fal/client';
import { persistSceneRender } from '@/lib/fal/storage';
import { translateScenePrompt } from '@/lib/fal/scene-prompt';
import { htmlToPlainText } from '@/lib/rich-text';
import {
  hashUserId,
  logImageGeneration,
  logModerationFlag,
  moderateGenerationText,
} from '@/lib/trust-safety';

const STOP_WORDS = new Set(['character', 'the', 'and', 'with', 'image', 'reference', 'ref', 'portrait', 'photo', 'pic']);
const MAX_REFS = 3;

export interface SceneCharacter {
  id?: string;
  name: string;
  avatar: string | null;
  gallery: unknown;
  nsfw?: boolean;
  personality?: string | null;
  summary?: string | null;
  visualDescription?: string | null;
  visualAnchor?: string | null;
}

export interface SceneRenderOptions {
  userId: string;
  sessionId?: string | null;
  recentMessages?: Array<{ role: string; content: string }>;
  /** When true, fal safety checker stays on. */
  enableSafetyChecker: boolean;
  landscape?: boolean;
}

export class ScenePolicyError extends Error {
  category?: string;
  constructor(message: string, category?: string) {
    super(message);
    this.category = category;
  }
}

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

function publicHttpUrl(url: string | null | undefined): string | null {
  const value = (url ?? '').trim();
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const parsed = new URL(value);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Production scene render via fal.ai (flux-2 / flux-2/edit).
 * Moderates inputs first (no credits should be charged by the caller on policy blocks).
 */
export async function renderSceneImage(
  character: SceneCharacter,
  description: string,
  options: SceneRenderOptions,
) {
  if (!falConfigured()) {
    throw new Error('Scene rendering is not configured. Set FAL_KEY on the server.');
  }

  const recentText = (options.recentMessages ?? []).map((m) => m.content).join('\n');
  const moderation = moderateGenerationText(
    character.name,
    character.personality,
    character.summary,
    character.visualDescription,
    character.visualAnchor,
    description,
    recentText,
  );
  if (!moderation.allowed) {
    await logModerationFlag({
      userId: options.userId,
      route: '/api/generate-scene',
      category: moderation.category || 'illegal',
      matched: moderation.matched,
    });
    throw new ScenePolicyError(moderation.message || 'Blocked by content policy.', moderation.category);
  }

  const portrait = character.avatar
    ? { url: character.avatar, label: character.name }
    : pickReferences(character, description)[0] ?? null;
  const referenceUrl = publicHttpUrl(portrait?.url);
  const appearance = [
    character.visualDescription,
    character.summary,
    character.personality,
  ].map((v) => htmlToPlainText(v || '')).filter(Boolean).join('. ');

  const translated = await translateScenePrompt({
    characterName: character.name?.trim() || 'Character',
    appearance,
    attire: description,
    visualDescription: character.visualDescription,
    visualAnchor: character.visualAnchor,
    sceneHint: description,
    recentMessages: options.recentMessages,
    hasReferenceImage: !!referenceUrl,
  });

  const translatedCheck = moderateGenerationText(translated.prompt);
  if (!translatedCheck.allowed) {
    await logModerationFlag({
      userId: options.userId,
      route: '/api/generate-scene/prompt',
      category: translatedCheck.category || 'illegal',
      matched: translatedCheck.matched,
    });
    throw new ScenePolicyError(translatedCheck.message || 'Blocked by content policy.', translatedCheck.category);
  }

  const enableSafetyChecker = options.enableSafetyChecker !== false;
  const fal = await generateFalScene({
    prompt: translated.prompt,
    referenceImageUrl: referenceUrl,
    landscape: options.landscape,
    enableSafetyChecker,
    userHash: hashUserId(options.userId),
  });

  await logImageGeneration({
    userId: options.userId,
    characterId: character.id ?? null,
    nsfwFlag: !!character.nsfw && !enableSafetyChecker,
    falRequestId: fal.requestId ?? null,
    model: fal.model,
    safetyChecker: enableSafetyChecker,
  });

  const stored = await persistSceneRender({
    falImageUrl: fal.url,
    userId: options.userId,
    sessionId: options.sessionId,
  });

  return {
    url: stored.url,
    cloud_storage_path: stored.path,
    engine: fal.model,
    promptModel: translated.model,
    visualPrompt: translated.prompt,
    referencesUsed: portrait ? [portrait.label || character.name] : [],
    falRequestId: fal.requestId,
    safetyChecker: enableSafetyChecker,
  };
}
