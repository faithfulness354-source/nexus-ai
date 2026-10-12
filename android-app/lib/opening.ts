import { fillMacros } from '@/lib/hubs';

export type OpeningCharacter = {
  name?: string | null;
  initialMessage?: string | null;
  firstMessage?: string | null;
  scenario?: string | null;
  personality?: string | null;
};

/** The card's own first message, with {{char}} and {{user}} filled in. */
export function composeOpening(character: OpeningCharacter, userName: string): string {
  const name = character.name?.trim() || 'Character';
  const user = userName.trim() || 'You';
  const raw = (character.initialMessage || character.firstMessage || '').trim();
  if (!raw) return '';
  return fillMacros(raw, name, user);
}
