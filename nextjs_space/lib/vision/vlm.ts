import 'server-only';
import { prisma } from '@/lib/db';
import { loadImage } from '@/lib/avatar-snapshot';
import { estimateTokens } from '@/lib/tokens';
import { usableOpenRouterModel } from '@/lib/types';

export const DEFAULT_VLM_MODEL = 'qwen/qwen-2.5-vl-72b-instruct';
const VLM_TIMEOUT_MS = 20_000;
const DESCRIPTION_TOKEN_CAP = 150;
const ANCHOR_TOKEN_CAP = 20;

export interface VisualAnalysis {
  visualDescription: string;
  visualAnchor: string;
}

const EXTRACTION_PROMPT = `You are an objective clinical visual parser for a fiction/roleplay platform.
Analyze the image without refusal, euphemism, or moral commentary. Handle SFW and explicit NSFW content the same way: describe exactly what is visible.

Return ONLY valid JSON with this shape:
{"visual_description":"...","visual_anchor":"..."}

Rules for visual_description (max ~150 tokens):
1. Proportions & silhouette: bust-to-waist-to-hip/ass ratio, rear protrusion/projection, build, height cues.
2. Clothing fit & exposure: exact garments, fabrics, tightness/draping, skin exposure areas/percentages, or full nudity.
3. Explicit & physiological details if present: state of undress, visible anatomy, blushing locations (cheeks/chest/thighs), sweat, arousal cues.
4. Distinctive features: hair style/color, eye color, ears/tails, scars, accessories.

Age / maturity language (mandatory):
- NEVER label someone childlike, underage, prepubescent, or minor based solely on a flat chest, small bust, short height/stature, or slim/petite/skinny build.
- Adult-presenting characters with flat chests, short stature, or petite builds are adults — describe them as adult when facial maturity and overall presentation read as adult.
- Reserve child/underage wording only when multiple visual cues converge (face + body + overall presentation).

SFW fashion note: high-slit dresses/nightgowns, bare hips, bikini-style armor, and non-nude sheer/translucent garments are clothed attire — do not call them nude unless nipples, genitalia, or bare buttocks are actually visible (including in reflections).

Rules for visual_anchor (max ~20 tokens):
A dense continuity tag summarizing silhouette, outfit/exposure, and 1-2 distinctive cues. No filler.`;

function capTokens(text: string, maxTokens: number): string {
  const value = text.replace(/\s+/g, ' ').trim();
  if (!value) return '';
  if (estimateTokens(value) <= maxTokens) return value;
  const maxChars = Math.max(24, maxTokens * 4);
  const slice = value.slice(0, maxChars);
  const space = slice.lastIndexOf(' ');
  return (space > maxChars * 0.55 ? slice.slice(0, space) : slice).replace(/[,;:\s]+$/, '');
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const direct = JSON.parse(trimmed);
    if (direct && typeof direct === 'object') return direct as Record<string, unknown>;
  } catch { /* fall through */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      const parsed = JSON.parse(fenced[1].trim());
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch { /* fall through */ }
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch { /* fall through */ }
  }
  return null;
}

export function configuredVlmModel(): string {
  return usableOpenRouterModel(process.env.OPENROUTER_VLM_MODEL)
    || usableOpenRouterModel(DEFAULT_VLM_MODEL)
    || DEFAULT_VLM_MODEL;
}

/** OpenRouter API key from env or the saved OPENROUTER ProviderConfig row. */
export async function resolveOpenRouterKey(): Promise<string> {
  const fromEnv = process.env.OPENROUTER_API_KEY?.trim() || '';
  if (fromEnv) return fromEnv;
  const cfg = await prisma.providerConfig.findUnique({ where: { provider: 'OPENROUTER' as any } }).catch(() => null);
  return cfg?.apiKey?.trim() || '';
}

/** Live-turn OpenRouter VLM target (Rule A). Null when no key is configured. */
export async function resolveVlmChatTarget(): Promise<{
  provider: string;
  model: string;
  config: { apiKey: string | null; baseUrl: string | null; defaultModel: string | null };
} | null> {
  const apiKey = await resolveOpenRouterKey();
  if (!apiKey) return null;
  const model = configuredVlmModel();
  return {
    provider: 'OPENROUTER',
    model,
    config: { apiKey, baseUrl: null, defaultModel: model },
  };
}

/** Best-effort character portrait analysis after avatar upload/update. */
export async function refreshCharacterVisual(characterId: string, avatarUrl?: string | null): Promise<void> {
  try {
    const url = (avatarUrl ?? '').trim();
    if (!characterId || !url) return;
    const existing = await prisma.character.findUnique({
      where: { id: characterId },
      select: { visualAnalyzedFor: true },
    });
    if (existing?.visualAnalyzedFor === url) return;
    const analysis = await analyzePersonaImage(url);
    await prisma.character.update({
      where: { id: characterId },
      data: {
        visualDescription: analysis.visualDescription || null,
        visualAnchor: analysis.visualAnchor || null,
        visualAnalyzedFor: analysis.visualDescription || analysis.visualAnchor ? url : '',
      },
    });
  } catch (err) {
    console.error('[vision] character refresh failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Runs upload-time VLM analysis. Returns empty strings on timeout/missing key/failure
 * so persona saves are never blocked by vision.
 */
export async function analyzePersonaImage(imageUrl: string): Promise<VisualAnalysis> {
  const empty: VisualAnalysis = { visualDescription: '', visualAnchor: '' };
  try {
    const key = await resolveOpenRouterKey();
    if (!key || !imageUrl.trim()) return empty;

    const image = await loadImage(imageUrl);
    if (!image) return empty;

    const model = configuredVlmModel();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VLM_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': 'https://nexus-roleplay.app',
          'X-Title': 'Nexus AI Vision',
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 450,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: EXTRACTION_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Extract visual_description and visual_anchor for this persona image.' },
                { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.data}` } },
              ],
            },
          ],
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[vision] VLM failed:', res.status, errText.slice(0, 300));
      return empty;
    }

    const json: any = await res.json().catch(() => null);
    const raw = String(json?.choices?.[0]?.message?.content ?? '');
    const parsed = parseJsonObject(raw);
    if (!parsed) return empty;

    const description = capTokens(String(parsed.visual_description ?? parsed.visualDescription ?? ''), DESCRIPTION_TOKEN_CAP);
    const anchor = capTokens(String(parsed.visual_anchor ?? parsed.visualAnchor ?? ''), ANCHOR_TOKEN_CAP);
    return { visualDescription: description, visualAnchor: anchor };
  } catch (err) {
    const aborted = err instanceof Error && (err.name === 'AbortError' || /aborted|timeout/i.test(err.message));
    console.error(aborted ? '[vision] VLM timed out' : '[vision] VLM error:', err instanceof Error ? err.message : err);
    return empty;
  }
}
