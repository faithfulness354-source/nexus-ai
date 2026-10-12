/**
 * Scene-image tags inside chat messages.
 * - The LLM writes `[GENERATE_IMAGE: scene description]` (pending render).
 * - After rendering, the server rewrites it to `[SCENE_IMAGE: <public url> | scene description]`.
 */
export const GENERATE_TAG_RE = /\[GENERATE_IMAGE:\s*([^\]]+?)\s*\]/gi;
const SCENE_TAG_RE = /\[SCENE_IMAGE:\s*(\S+?)\s*\|\s*([^\]]*?)\s*\]/gi;
const ANY_TAG_RE = /\[(GENERATE_IMAGE|SCENE_IMAGE):\s*([^\]]+?)\s*\]/gi;

export type SceneSegment =
  | { type: 'text'; text: string }
  | { type: 'pending'; description: string }
  | { type: 'image'; url: string; description: string };

/** Splits message content into text and scene-image segments, in order. */
export function parseSceneSegments(content: string): SceneSegment[] {
  const out: SceneSegment[] = [];
  let last = 0;
  for (const m of content.matchAll(ANY_TAG_RE)) {
    const start = m.index ?? 0;
    const before = content.slice(last, start);
    if (before.trim()) out.push({ type: 'text', text: before });
    if (m[1].toUpperCase() === 'GENERATE_IMAGE') {
      out.push({ type: 'pending', description: m[2].trim() });
    } else {
      const [url, ...rest] = m[2].split('|');
      out.push({ type: 'image', url: url.trim(), description: rest.join('|').trim() });
    }
    last = start + m[0].length;
  }
  const tail = content.slice(last);
  if (tail.trim()) out.push({ type: 'text', text: tail });
  return out;
}

export function hasPendingScene(content: string): boolean {
  return new RegExp(GENERATE_TAG_RE.source, 'i').test(content);
}

/** Hides a half-streamed tag such as `[GENERATE_IMAGE: a moonlit fo` while tokens arrive. */
export function hidePartialSceneTag(content: string): string {
  return content.replace(/\[(G|GE|GEN|GENE|GENER|GENERA|GENERAT|GENERATE|GENERATE_|GENERATE_I|GENERATE_IM|GENERATE_IMA|GENERATE_IMAG|GENERATE_IMAGE)(:[^\]]*)?$/i, '').trimEnd();
}

/** Plain text for copy/clipboard (no tags). */
export function stripSceneTags(content: string): string {
  return content.replace(ANY_TAG_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** History sent back to the LLM: rendered scenes revert to the short tag so URLs never enter the prompt. */
export function sceneTagsForLLM(content: string): string {
  return content.replace(SCENE_TAG_RE, (_m, _url, desc) => `[GENERATE_IMAGE: ${desc}]`);
}
