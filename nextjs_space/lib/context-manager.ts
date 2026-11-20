import { estimateTokens, DEFINITION_TOKEN_CAP } from './tokens';
import { LLMMessage } from './types';
import { isDeletedMessage, messageContent, spliceDeletedMessages } from './llm/messages';

export interface TurnTokens {
  /** definition_tokens + recent_history_tokens (what the model is billed/capped against). */
  sent_tokens: number;
  /** Token count of the recent dialogue window only. */
  recent_history_tokens: number;
  /** Compressed system / character definition tokens for this turn. */
  definition_tokens: number;
}

/**
 * Drops soft-deleted turns, then recounts the tokens that will actually be sent.
 * Used by the chat UI counter and by the server before a NovelAI / LLM request.
 */
export function recountTurnTokens(
  history: Array<{ role?: string; content?: unknown; deleted?: unknown }> | null | undefined,
  definitionTokens: number,
): TurnTokens & { messages: Array<{ role: string; content: string }> } {
  const live = spliceDeletedMessages(history ?? [])
    .filter((message) => !isDeletedMessage(message))
    .map((message) => ({
      role: String(message.role ?? 'user'),
      content: messageContent(message.content).trim(),
    }))
    .filter((message) => message.content.length > 0);
  const recent_history_tokens = live.reduce((sum, message) => sum + estimateTokens(message.content), 0);
  const definition_tokens = Math.min(DEFINITION_TOKEN_CAP, Math.max(0, Math.floor(definitionTokens) || 0));
  return {
    sent_tokens: definition_tokens + recent_history_tokens,
    recent_history_tokens,
    definition_tokens,
    messages: live,
  };
}

export interface ContextBudget {
  maxTokens: number;
  systemTokens: number;
  historyTokens: number;
  remaining: number;
  trimmed: boolean;
}

export function buildContext(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  maxContextTokens: number,
  reserveForResponse = 2048, // leave room for response
): { messages: LLMMessage[]; budget: ContextBudget } {
  const systemTokens = estimateTokens(systemPrompt);
  const availableForHistory = maxContextTokens - systemTokens - reserveForResponse;

  const llmMessages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

  let totalHistoryTokens = 0;
  let trimmed = false;
  const safeMessages = spliceDeletedMessages(messages ?? []).filter((message) => !isDeletedMessage(message) && messageContent(message.content).trim());

  // Walk from newest to oldest, include as many as fit
  const included: LLMMessage[] = [];
  for (let i = safeMessages.length - 1; i >= 0; i--) {
    const msg = safeMessages[i];
    const tokens = estimateTokens(msg?.content ?? '');
    if (totalHistoryTokens + tokens > availableForHistory) {
      trimmed = true;
      break;
    }
    totalHistoryTokens += tokens;
    included.unshift({
      role: (msg?.role?.toLowerCase() ?? 'user') as 'user' | 'assistant',
      content: msg?.content ?? '',
    });
  }

  llmMessages.push(...included);

  return {
    messages: llmMessages,
    budget: {
      maxTokens: maxContextTokens,
      systemTokens,
      historyTokens: totalHistoryTokens,
      remaining: maxContextTokens - systemTokens - totalHistoryTokens,
      trimmed,
    },
  };
}
