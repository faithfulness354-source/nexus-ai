import { ChubV2Card, CharacterCard } from './types';
import { htmlToPlainText } from './rich-text';

export interface NormalizedCard {
  name: string;
  title: string;
  summary: string;
  personality: string;
  scenario: string;
  initialMessage: string;
  exampleDialogue: string;
  systemPrompt: string;
  creatorNotes: string;
  tags: string[];
  creator: string;
  nsfw: boolean;
  /** Remote avatar URL found in the payload (Janitor/Chub API), if any. */
  avatarUrl: string | null;
}

const str = (...vals: any[]): string => {
  for (const v of vals) if (typeof v === 'string' && v.trim()) return v.trim();
  return '';
};

function toTags(...lists: any[]): string[] {
  const out = new Set<string>();
  for (const list of lists) {
    const arr = Array.isArray(list) ? list : typeof list === 'string' ? list.split(',') : [];
    for (const t of arr) {
      const name = typeof t === 'string' ? t : t?.name ?? t?.slug ?? '';
      const clean = String(name).replace(/^#/, '').trim();
      if (clean && clean.length <= 40) out.add(clean);
    }
  }
  return Array.from(out).slice(0, 25);
}

function excerpt(text: string, max = 280): string {
  const plain = htmlToPlainText(text).replace(/\s+/g, ' ').trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

/**
 * Normalises any common character format into Nexus fields:
 * Tavern V1, Character Card V2/V3 (Chub, SillyTavern, Janitor exports), Chub API `node.definition`,
 * Janitor AI API objects and Pygmalion-style (char_persona / char_greeting) JSON.
 */
export function normalizeCard(input: any): NormalizedCard {
  if (!input || typeof input !== 'object') throw new Error('Card data is empty or not an object');
  const node = input.node ?? input.character ?? null; // Chub / some API wrappers
  const def = node?.definition ?? null;
  const d: any = def ? { ...node, ...def } : input.data && typeof input.data === 'object' ? input.data : node ?? input;
  // Janitor AI (and Chub's API) keep the definition in `personality`; their `description` is the public bio.
  const isJanitor = !def && d && typeof d === 'object' && !('first_mes' in d) && ('first_message' in d || 'example_dialogs' in d);
  const isChubDef = !!def || isJanitor;
  // Cards exported by Nexus itself put the bio in `description` and the definition in `personality`.
  if (d?.extensions?.nexus) {
    const tags = toTags(d.tags);
    return {
      name: str(d.name) || 'Imported Character', title: str(d.extensions.nexus.title), summary: str(d.description),
      personality: str(d.personality), scenario: str(d.scenario), initialMessage: str(d.first_mes),
      exampleDialogue: str(d.mes_example), systemPrompt: str(d.system_prompt), creatorNotes: str(d.creator_notes),
      tags, creator: str(d.creator) || 'Anonymous', nsfw: tags.some((t) => /^nsfw$/i.test(t)), avatarUrl: null,
    };
  }

  const name = str(d.name, d.char_name, node?.name, input.name);
  if (!name) throw new Error('No character name found in this card');

  // Tavern `description` is the main definition; `personality` is a short trait summary.
  // Chub's API stores the definition in `personality` and the trait summary in `tavern_personality`.
  const definition = isChubDef ? str(d.personality, isJanitor ? '' : d.description) : str(d.description, d.char_persona);
  const traits = isChubDef ? str(d.tavern_personality) : str(d.char_persona ? '' : d.personality);
  const personality = traits && traits !== definition ? (definition ? `${definition}\n\nPersonality: ${traits}` : traits) : definition;

  const creatorNotes = str(d.creator_notes, d.creatorcomment, def ? node?.description : '', isJanitor ? d.description : '');
  const tags = toTags(d.tags, d.topics, node?.topics, d.custom_tags);
  const nsfwTag = tags.some((t) => /^nsfw$/i.test(t));

  let avatarUrl: string | null = str(d.avatar_url, node?.avatar_url, d.max_res_url, node?.max_res_url) || null;
  if (!avatarUrl && typeof d.avatar === 'string' && d.avatar && d.avatar !== 'none') {
    avatarUrl = /^https?:\/\//.test(d.avatar) ? d.avatar : `https://ella.janitorai.com/bot-avatars/${d.avatar}`;
  }

  return {
    name: name.slice(0, 120),
    title: str(d.tagline, node?.tagline).slice(0, 160),
    summary: excerpt(str(d.tagline, node?.tagline, creatorNotes, d.description, definition)),
    personality,
    scenario: str(d.scenario, d.world_scenario),
    initialMessage: str(d.first_mes, d.first_message, d.char_greeting, d.greeting),
    exampleDialogue: str(d.mes_example, d.example_dialogs, d.example_dialogue, d.exampleDialogue),
    systemPrompt: str(d.system_prompt),
    creatorNotes,
    tags,
    creator: str(d.creator, d.creator_name, node?.fullPath?.split('/')?.[0], input.creator).slice(0, 60) || 'Anonymous',
    nsfw: nsfwTag || d.is_nsfw === true || node?.nsfw_image === true,
    avatarUrl,
  };
}

/** @deprecated kept for older callers; prefer normalizeCard. */
export function parseChubV2(input: any): Partial<CharacterCard> {
  const c = normalizeCard(input);
  return { ...c, customRules: JSON.stringify({ meters: [], rules: [] }) };
}

export function exportAsChubV2(character: CharacterCard): ChubV2Card {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    name: character?.name ?? '',
    description: character?.summary ?? '',
    personality: character?.personality ?? '',
    first_mes: character?.initialMessage ?? '',
    scenario: character?.scenario ?? '',
    mes_example: character?.exampleDialogue ?? '',
    system_prompt: character?.systemPrompt ?? '',
    creator_notes: character?.creatorNotes ?? '',
    tags: character?.tags ?? [],
    extensions: { nexus: { title: character?.title ?? '' } },
  };
}
