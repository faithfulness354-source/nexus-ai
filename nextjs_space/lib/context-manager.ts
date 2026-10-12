import { estimateTokens } from './tokens';
import { LLMMessage } from './types';

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
  const safeMessages = messages ?? [];

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
