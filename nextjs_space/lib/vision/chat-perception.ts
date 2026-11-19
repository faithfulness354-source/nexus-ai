import { estimateTokens } from '@/lib/tokens';

/** Explicit visual-check verbs that warrant a live image look when cached description is missing/stale. */
export const VISUAL_INSPECTION_RE =
  /\b(look at me|check out my|how do i look|inspect(?:\s+me)?|undress|strip(?:\s+me)?|take off|pose|turn around|look(?:ing)? (?:at|over) (?:my|me))\b/i;

/** Clothing changes or a new NPC entering in recent dialogue. */
export const ATTIRE_OR_NPC_ENTRY_RE =
  /\b(enters?|arrived|walks? in|comes? in|new (?:npc|character|person)|changes? (?:into|clothes|clothing|outfit)|puts? on|takes? off|undress(?:es|ed)?|strips?|wardrobe|outfit change)\b/i;

export const VISUAL_PERCEPTION_RULE =
  `[Visual Perception Rule]: When {{user}} enters a scene, meets a new NPC, changes clothing, or posts an image, NPCs must actively notice and react realistically to {{user}}'s exact silhouette, proportions, clothing fit, skin exposure, blushing, or nudity as defined in [Persona Appearance] or the attached image. Express reactions through grounded gaze, posture shifts, and dialogue without robotic stat-listing.`;

export interface PersonaVisualFields {
  avatar?: string | null;
  visualDescription?: string | null;
  visualAnchor?: string | null;
  visualAnalyzedFor?: string | null;
  avatarSnapshot?: string | null;
}

export function isVisualDescriptionStale(persona: PersonaVisualFields): boolean {
  const avatar = (persona.avatar ?? '').trim();
  if (!avatar) return true;
  const analyzedFor = (persona.visualAnalyzedFor ?? '').trim();
  const description = (persona.visualDescription ?? '').trim();
  if (!description) return true;
  return !!analyzedFor && analyzedFor !== avatar;
}

export function extractMessageImageUrl(content: string, explicit?: string | null): string | null {
  const direct = (explicit ?? '').trim();
  if (direct && (/^https?:\/\//i.test(direct) || direct.startsWith('data:image/'))) return direct;
  const text = String(content ?? '');
  const md = text.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i);
  if (md?.[1]) return md[1];
  const bare = text.match(/(https?:\/\/\S+\.(?:png|jpe?g|webp|gif)(?:\?\S*)?)/i);
  return bare?.[1] ?? null;
}

export function needsLiveVlmLook(opts: {
  historyLength: number;
  userMessage: string;
  attachedImageUrl?: string | null;
  persona: PersonaVisualFields | null;
}): boolean {
  if (opts.attachedImageUrl) return true;
  const hasAvatar = !!(opts.persona?.avatar ?? '').trim();
  if (opts.historyLength <= 2 && hasAvatar) return true;
  if (VISUAL_INSPECTION_RE.test(opts.userMessage) && (!opts.persona || isVisualDescriptionStale(opts.persona))) {
    return hasAvatar;
  }
  return false;
}

export function recentTurnsMentionAttireOrNpc(turns: string[]): boolean {
  const sample = turns.slice(-2).join('\n');
  return ATTIRE_OR_NPC_ENTRY_RE.test(sample);
}

/** Token-optimized persona appearance block for text-only turns. */
export function personaAppearanceInjection(
  persona: PersonaVisualFields,
  mode: 'full' | 'anchor',
): string {
  const description = (persona.visualDescription ?? '').trim();
  const anchor = (persona.visualAnchor ?? '').trim()
    || (persona.avatarSnapshot ?? '').trim();
  if (mode === 'full' && description) {
    return `[Persona Appearance]\n${description}`;
  }
  if (anchor) {
    const clipped = estimateTokens(anchor) > 24
      ? anchor.split(/\s+/).slice(0, 20).join(' ')
      : anchor;
    return `[Persona Appearance]\n${clipped}`;
  }
  if (description) {
    // Prefer a truncated description over nothing when anchor is missing.
    const words = description.split(/\s+/).slice(0, 20).join(' ');
    return `[Persona Appearance]\n${words}`;
  }
  return '';
}
