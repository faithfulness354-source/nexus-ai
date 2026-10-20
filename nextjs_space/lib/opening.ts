import { fillMacros } from '@/lib/hubs';

export type OpeningCharacter = {
  name?: string | null;
  initialMessage?: string | null;
  firstMessage?: string | null;
  scenario?: string | null;
  personality?: string | null;
};

/** The card's first message. A field that is present wins, including an empty string, so an older copy cannot replace it. */
export function cardFirstMessage(character: {
  firstMessage?: unknown;
  initialMessage?: unknown;
  first_mes?: unknown;
} | null | undefined): string {
  if (!character) return '';
  if (typeof character.firstMessage === 'string') return character.firstMessage;
  if (typeof character.initialMessage === 'string') return character.initialMessage;
  if (typeof character.first_mes === 'string') return character.first_mes;
  return '';
}

/** Keeps creator text as entered. Null becomes an empty string; nothing is trimmed or rewritten. */
export function exactCardText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

/** First message from a save payload. `firstMessage` is the editor field and beats any other key on the body. */
export function savedFirstMessage(body: {
  firstMessage?: unknown;
  initialMessage?: unknown;
  first_mes?: unknown;
} | null | undefined): string | undefined {
  if (!body) return undefined;
  if (Object.prototype.hasOwnProperty.call(body, 'firstMessage')) return exactCardText(body.firstMessage);
  if (Object.prototype.hasOwnProperty.call(body, 'initialMessage')) return exactCardText(body.initialMessage);
  if (Object.prototype.hasOwnProperty.call(body, 'first_mes')) return exactCardText(body.first_mes);
  return undefined;
}

/** Bio (`summary`), personality, or scenario from a save payload, unchanged. */
export function savedStaticField(body: object | null | undefined, key: 'summary' | 'personality' | 'scenario'): string | undefined {
  if (!body || !Object.prototype.hasOwnProperty.call(body, key)) return undefined;
  return exactCardText((body as Record<string, unknown>)[key]);
}

/** The card's own first message, with {{char}} and {{user}} filled in. */
export function composeOpening(character: OpeningCharacter, userName: string): string {
  const name = character.name?.trim() || 'Character';
  const user = userName.trim() || 'You';
  const raw = cardFirstMessage(character);
  if (!raw.trim()) return '';
  return fillMacros(raw, name, user);
}
