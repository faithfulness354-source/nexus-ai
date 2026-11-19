import 'server-only';
import { htmlToPlainText } from '@/lib/rich-text';
import { resolveOpenRouterKey } from '@/lib/vision/vlm';

/** Mandatory style anchor appended to every visual scene prompt. */
export const SCENE_STYLE_ANCHOR =
  '2.5D semi-realistic digital illustration, detailed skin texture, volumetric cinematic lighting, intricate clothing/armor filigree, expressive pose, sharp focus, zero text, no watermarks.';

const TRANSLATOR_SYSTEM = `You are a visual prompt translator for an image generator.
Convert roleplay context into ONE rich English visual scene prompt.
Rules:
- Output ONLY the visual prompt text. No quotes, labels, markdown, or commentary.
- Describe appearance, attire, pose, expression, setting, lighting, and camera framing.
- Strip all dialogue, OOC notes, stage directions in brackets, HTML, and UI chrome.
- Never invent underage subjects; every person is an adult (18+).
- Do not include watermarks, logos, captions, speech bubbles, or readable text in the scene.
- Keep the prompt under 220 words.
- End by reinforcing this exact style clause: ${SCENE_STYLE_ANCHOR}`;

export interface ScenePromptInput {
  characterName: string;
  appearance?: string | null;
  attire?: string | null;
  visualDescription?: string | null;
  visualAnchor?: string | null;
  sceneHint: string;
  recentMessages?: Array<{ role: string; content: string }>;
  hasReferenceImage?: boolean;
}

/** Strip HTML, dialogue-ish lines, and OOC markers from free text. */
export function sanitizeVisualSource(raw: string | null | undefined): string {
  let text = htmlToPlainText(raw ?? '');
  text = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[(?:ooc|OOC|system|SYSTEM)[^\]]*\]/gi, ' ')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/["“”][^"“”]{0,240}["“”]/g, ' ')
    .replace(/\b(?:says?|asks?|replies?|whispers?|shouts?)\b[:\s].*$/gim, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function formatRecent(messages: Array<{ role: string; content: string }> | undefined): string {
  if (!messages?.length) return '(none)';
  return messages
    .slice(-3)
    .map((m) => {
      const role = m.role.toLowerCase() === 'assistant' ? 'Character' : 'User';
      return `${role}: ${sanitizeVisualSource(m.content).slice(0, 280)}`;
    })
    .filter((line) => line.length > 12)
    .join('\n');
}

function fallbackPrompt(input: ScenePromptInput): string {
  const parts = [
    input.characterName,
    sanitizeVisualSource(input.visualAnchor || input.visualDescription || input.appearance),
    sanitizeVisualSource(input.attire),
    sanitizeVisualSource(input.sceneHint),
    input.hasReferenceImage ? 'exact likeness of the character in @image1' : '',
    SCENE_STYLE_ANCHOR,
  ].filter(Boolean);
  return parts.join(', ').replace(/\s+/g, ' ').trim();
}

/**
 * Fast LLM pass that turns chat context into a fal.ai-ready visual prompt.
 * Falls back to a deterministic prompt if OpenRouter is unavailable.
 */
export async function translateScenePrompt(input: ScenePromptInput): Promise<{ prompt: string; model: string | null }> {
  const hint = sanitizeVisualSource(input.sceneHint);
  if (!hint) return { prompt: fallbackPrompt(input), model: null };

  const key = await resolveOpenRouterKey();
  const model = process.env.OPENROUTER_SCENE_MODEL?.trim()
    || process.env.OPENROUTER_MODEL_NAME?.trim()
    || 'meta-llama/llama-3.3-70b-instruct';

  if (!key) return { prompt: fallbackPrompt(input), model: null };

  const userBlock = [
    `Character name: ${input.characterName}`,
    `Physical appearance: ${sanitizeVisualSource(input.visualDescription || input.appearance) || '(unspecified)'}`,
    `Visual anchor: ${sanitizeVisualSource(input.visualAnchor) || '(none)'}`,
    `Current attire: ${sanitizeVisualSource(input.attire) || '(from scene hint)'}`,
    `Scene hint: ${hint}`,
    `Recent chat (last 2–3 turns, for mood/pose only):\n${formatRecent(input.recentMessages)}`,
    input.hasReferenceImage
      ? 'A reference portrait is attached as @image1 — preserve that identity, face, and body type.'
      : 'No reference portrait — invent a consistent adult look from the appearance specs.',
    'Write the visual prompt now.',
  ].join('\n');

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    let res: Response;
    try {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': 'https://nexus-roleplay.app',
          'X-Title': 'Nexus AI Scene Prompt',
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          max_tokens: 320,
          messages: [
            { role: 'system', content: TRANSLATOR_SYSTEM },
            { role: 'user', content: userBlock },
          ],
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      console.warn('[fal] scene prompt LLM failed', res.status);
      return { prompt: fallbackPrompt(input), model: null };
    }
    const json: any = await res.json().catch(() => null);
    let prompt = sanitizeVisualSource(String(json?.choices?.[0]?.message?.content ?? ''));
    prompt = prompt.replace(/^prompt\s*:\s*/i, '').trim();
    if (!prompt || prompt.length < 24) return { prompt: fallbackPrompt(input), model: null };
    if (!/2\.5D semi-realistic digital illustration/i.test(prompt)) {
      prompt = `${prompt.replace(/[.\s]+$/, '')}. ${SCENE_STYLE_ANCHOR}`;
    }
    if (input.hasReferenceImage && !/@image1/i.test(prompt)) {
      prompt = `${prompt} Match the character identity in @image1.`;
    }
    return { prompt, model };
  } catch (err) {
    console.warn('[fal] scene prompt LLM error', err instanceof Error ? err.message : err);
    return { prompt: fallbackPrompt(input), model: null };
  }
}
