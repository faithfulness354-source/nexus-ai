// Client + server safe helpers for Personas, Lorebooks and Scripts.
import { estimateTokens } from '@/lib/tokens';
import { htmlToPlainText } from '@/lib/rich-text';
import { compilePerceivedAppearance } from '@/lib/persona-appearance';

export const PRONOUN_OPTIONS = ['He/Him', 'She/Her', 'They/Them'] as const;
export const PERSONA_TOKEN_BUDGET = 350;

export interface PersonaData {
  id: string;
  name: string;
  avatar: string | null;
  pronouns: string;
  physical: string;
  attire: string;
  visualTraits: string;
  appearance?: import('@/lib/persona-appearance').Appearance | string | null;
  avatarSnapshot?: string | null;
  personality: string;
  backstory: string;
  speech: string;
  isDefault: boolean;
  boundCharacterIds: string[];
}

export const PERSONA_TEXT_FIELDS = ['physical', 'attire', 'visualTraits', 'personality', 'backstory', 'speech'] as const;

function plain(value?: string | null): string {
  return htmlToPlainText(value || '').replace(/\s+/g, ' ').trim();
}

/** Appearance, traits, and background the character can perceive. Visuals are also sent as their own block. */
export function formatPersona(p: Partial<PersonaData>): string {
  const lines = [
    plain(p.physical) ? `Body: ${plain(p.physical)}` : '',
    plain(p.visualTraits) ? `Features: ${plain(p.visualTraits)}` : '',
    plain(p.attire) ? `Clothing: ${plain(p.attire)}` : '',
    plain(p.personality) ? `Traits: ${plain(p.personality)}` : '',
    plain(p.backstory) ? `Background: ${plain(p.backstory)}` : '',
    plain(p.speech) ? `Speech: ${plain(p.speech)}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

export const PERSONA_VISUAL_KEYWORDS = ['meet', 'meets', 'outfit', 'appearance', 'introduce', 'stare', 'describe'];

/** Full persona only on the first meeting (≤2 turns) or when the latest message mentions visuals/introductions. */
export function shouldLoadFullPersona(historyLength: number, latestMessage: string): boolean {
  if (historyLength <= 2) return true;
  const text = latestMessage.toLowerCase();
  return PERSONA_VISUAL_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`).test(text));
}

/** Minimal reference anchor used on standard turns to save tokens. */
export function personaAnchor(p: Partial<PersonaData>): string {
  const name = p.name?.trim() || 'User';
  const pronouns = p.pronouns?.trim();
  return pronouns ? `${name} (${pronouns})` : name;
}

export function personaTokens(p: Partial<PersonaData>): number {
  return estimateTokens(`${compilePerceivedAppearance(p)}\n${formatPersona(p)}`);
}

/** Which persona applies to a chat: explicit session pick → bound to character → global default. */
export function pickPersona<T extends { id: string; isDefault: boolean; boundCharacterIds: string[] }>(
  personas: T[], characterId: string, sessionPersonaId?: string | null,
): T | null {
  return (
    (sessionPersonaId ? personas.find((p) => p.id === sessionPersonaId) : undefined) ??
    personas.find((p) => p.boundCharacterIds.includes(characterId)) ??
    personas.find((p) => p.isDefault) ??
    null
  );
}

// ---------- Lorebooks ----------
export type LorePlacement = 'personality' | 'scenario' | 'example_dialogs' | 'default';

export interface LoreEntryData {
  id?: string;
  title: string;
  keys: string[];
  content: string;
  order: number;
  priority: number;
  depth: number;
  enabled: boolean;
  placement?: LorePlacement;
  constant?: boolean;
}

export const LORE_TOKEN_BUDGET = 1500;

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function keyMatches(key: string, text: string): boolean {
  const k = key.trim();
  if (!k) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(k)}($|[^\\p{L}\\p{N}])`, 'iu').test(text);
}

/** Case-insensitive substring, or a `/pattern/flags` keyword. */
export function keywordHits(key: string, text: string): boolean {
  const k = key.trim();
  if (!k || !text) return false;
  const wrapped = k.match(/^\/([\s\S]+)\/([gimsuy]*)$/);
  if (wrapped && wrapped[1].length <= 80) {
    try {
      const flags = wrapped[2].includes('i') ? wrapped[2] : `${wrapped[2]}i`;
      return new RegExp(wrapped[1], flags).test(text);
    } catch {
      return false;
    }
  }
  return text.toLowerCase().includes(k.toLowerCase());
}

/**
 * Entries that are constant, or whose keywords hit the last `depth` messages.
 * Higher priority is kept first when the token budget runs out. Equal priority
 * follows insertion order.
 */
export function selectLore(entries: LoreEntryData[], recent: string[], budget = LORE_TOKEN_BUDGET): LoreEntryData[] {
  const hits = entries.filter((entry) => {
    if (!entry.enabled || !entry.content.trim()) return false;
    if (entry.constant) return true;
    const window = recent.slice(-Math.max(1, entry.depth || 4)).join('\n');
    return entry.keys.some((key) => keywordHits(key, window));
  });
  hits.sort((a, b) => b.priority - a.priority || a.order - b.order);
  const kept: LoreEntryData[] = [];
  let used = 0;
  for (const entry of hits) {
    const tokens = estimateTokens(entry.content);
    if (used + tokens > budget) continue;
    used += tokens;
    kept.push(entry);
  }
  return kept;
}

const PLACEMENT_HEADER: Record<LorePlacement, string> = {
  personality: '[LORE:PERSONALITY]',
  scenario: '[LORE:SCENARIO]',
  example_dialogs: '[LORE:EXAMPLE]',
  default: '[LORE]',
};

/** Groups activated entries by where they should sit in the prompt. */
export function formatLoreContext(entries: LoreEntryData[]): string {
  const groups = new Map<LorePlacement, string[]>();
  for (const entry of entries) {
    const placement = entry.placement && PLACEMENT_HEADER[entry.placement] ? entry.placement : 'default';
    const line = entry.title.trim() ? `${entry.title.trim()}: ${entry.content.trim()}` : entry.content.trim();
    const list = groups.get(placement) ?? [];
    list.push(line);
    groups.set(placement, list);
  }
  const order: LorePlacement[] = ['personality', 'scenario', 'example_dialogs', 'default'];
  return order
    .filter((placement) => groups.get(placement)?.length)
    .map((placement) => `${PLACEMENT_HEADER[placement]}\n${groups.get(placement)!.join('\n\n')}`)
    .join('\n\n');
}

// ---------- Scripts ----------
export type ScriptPlacement = 'PRE' | 'POST' | 'DISPLAY';
export interface ScriptData {
  id: string;
  name: string;
  kind: 'REGEX' | 'PROMPT';
  findPattern: string;
  flags: string;
  replaceWith: string;
  placement: ScriptPlacement;
  promptText: string;
  enabled: boolean;
  order: number;
}

export const PLACEMENT_LABELS: Record<ScriptPlacement, string> = {
  PRE: 'Pre-response (your message, before it is sent)',
  POST: 'Post-response (AI reply, before it is saved)',
  DISPLAY: 'Display only (visual formatting, nothing is changed)',
};

export function sanitizeFlags(flags: string): string {
  return Array.from(new Set((flags || '').replace(/[^gimsuy]/g, '').split(''))).join('');
}

/** Compiles a user regex safely; returns an error message instead of throwing. */
export function compileScript(pattern: string, flags: string): RegExp | string {
  if (!pattern) return 'Pattern is empty';
  if (pattern.length > 500) return 'Pattern is too long (max 500 characters)';
  try {
    return new RegExp(pattern, sanitizeFlags(flags));
  } catch (e: any) {
    return e?.message ?? 'Invalid regular expression';
  }
}

export function applyScripts(
  text: string,
  scripts: (Pick<ScriptData, 'enabled' | 'findPattern' | 'flags' | 'replaceWith' | 'order'> & { kind: string; placement: string })[],
  placement: ScriptPlacement,
): string {
  let out = text;
  const list = scripts
    .filter((s) => s.kind === 'REGEX' && s.enabled && s.placement === placement)
    .sort((a, b) => a.order - b.order);
  for (const s of list) {
    const re = compileScript(s.findPattern, s.flags);
    if (typeof re === 'string') continue;
    const replacement = s.replaceWith.replace(/\\n/g, '\n');
    try {
      // A pattern that can match an empty string (e.g. `x*`, `(OOC)?`) would insert the replacement
      // between every character and balloon the text — skip such scripts when they insert text.
      if (replacement && re.global && [...out.matchAll(re)].some((m) => m[0] === '')) continue;
      const next = out.replace(re, replacement);
      // Never let a script blow the reply up (runaway `$&`/backreference replacements).
      if (next.length > Math.max(out.length * 2, out.length + 2000)) continue;
      out = next;
    } catch { /* ignore bad replacement */ }
  }
  return out;
}

/**
 * Drops a dangling half-sentence left when a reply was cut off (output cap or dropped stream),
 * so a truncated reply is saved ending on its last complete sentence. Keeps the text unchanged
 * when it already ends cleanly or when trimming would remove more than half of it.
 */
export function trimIncompleteTail(text: string): string {
  const t = text.replace(/\s+$/, '');
  if (!t || /^\[Error/.test(t)) return text;
  if (/[.!?…"'”’*)\]~>_`\-—]$/.test(t) || /\p{Extended_Pictographic}$/u.test(t)) return t;
  let cut = -1;
  const re = /[.!?…]["'”’*)\]]*(?=\s)/g;
  for (let m = re.exec(t); m; m = re.exec(t)) cut = m.index + m[0].length;
  return cut >= t.length * 0.5 ? t.slice(0, cut) : t;
}

export function fillMacros(text: string, charName: string, userName: string): string {
  return text.replace(/\{\{char\}\}/gi, charName).replace(/\{\{user\}\}/gi, userName);
}
