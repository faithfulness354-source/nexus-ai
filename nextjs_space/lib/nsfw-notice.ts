/** Adult clothing and nudity cues that should carry the NSFW notice. */
const ADULT_ATTIRE = /\b(?:nudity|nudes?|naked|topless|bottomless|underwear|lingerie|panties|panty|thongs?|bras?)\b/i;

function asText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return ''; }
}

/** True when the card text mentions nudity, underwear, or lingerie. */
export function textImpliesNsfw(...parts: unknown[]): boolean {
  const text = parts.map(asText).join('\n').replace(/<[^>]+>/g, ' ');
  return ADULT_ATTIRE.test(text);
}

/** Card fields a visitor can read. HTML tags are ignored so markup cannot hide a word. */
export function characterImpliesNsfw(card: {
  name?: unknown;
  title?: unknown;
  summary?: unknown;
  personality?: unknown;
  scenario?: unknown;
  initialMessage?: unknown;
  firstMessage?: unknown;
  exampleDialogue?: unknown;
  creatorNotes?: unknown;
  systemPrompt?: unknown;
  tags?: unknown;
  gallery?: unknown;
} | null | undefined): boolean {
  if (!card) return false;
  return textImpliesNsfw(
    card.name, card.title, card.summary, card.personality, card.scenario,
    card.initialMessage, card.firstMessage, card.exampleDialogue, card.creatorNotes,
    card.systemPrompt, card.tags, card.gallery,
  );
}
