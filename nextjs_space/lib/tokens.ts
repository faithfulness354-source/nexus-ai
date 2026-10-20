// Token estimation utility
// Uses ~4 chars/token heuristic (reliable cross-model)

import { htmlToPlainText } from './rich-text';

/** Character card, lore, persona rules, and world state together stay under this on every turn. */
export const DEFINITION_TOKEN_CAP = 800;

export function estimateTokens(raw: string): number {
  if (!raw) return 0;
  // Count what the model actually receives: HTML formatting is stripped before sending.
  const text = htmlToPlainText(raw);
  // Rough estimation: ~4 chars per token for English text
  return Math.ceil(text.length / 4);
}

export function countSystemTokens(character: {
  systemPrompt?: string;
  personality?: string;
  scenario?: string;
  exampleDialogue?: string;
  customRules?: string;
  initialMessage?: string;
}): number {
  const parts = [
    character?.systemPrompt ?? '',
    character?.personality ?? '',
    character?.scenario ?? '',
    character?.exampleDialogue ?? '',
    character?.customRules ?? '',
  ];
  return parts.reduce((sum: number, p: string) => sum + estimateTokens(p), 0);
}

export function countHistoryTokens(messages: Array<{ content: string }>): number {
  return (messages ?? []).reduce((sum: number, m: any) => sum + estimateTokens(m?.content ?? ''), 0);
}
