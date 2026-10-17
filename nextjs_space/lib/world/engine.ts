import 'server-only';
import { embedText } from './embed';
import { applyWorldPatch, ensureWorldState, insertMemory, matchMemories } from './store';
import { requestWorldToolCalls } from './tools';
import { formatWorldContext, memoryFromArgs, worldPatchFromArgs } from './types';

const TOP_K = 6;

export interface WorldTurnTarget {
  provider: string;
  model: string;
  apiKey?: string | null;
  baseUrl?: string | null;
}

const WORLD_LOOKUP_MS = 2500;

/** Embeds the latest user line, retrieves similar memories, and returns the system block. */
export async function loadWorldPrompt(sessionId: string, userText: string, target: WorldTurnTarget): Promise<string> {
  try {
    return await Promise.race([
      assembleWorldPrompt(sessionId, userText, target),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), WORLD_LOOKUP_MS)),
    ]);
  } catch (err) {
    console.warn('[world] context skipped:', err instanceof Error ? err.message : err);
    return '';
  }
}

async function assembleWorldPrompt(sessionId: string, userText: string, target: WorldTurnTarget): Promise<string> {
  try {
    const state = await ensureWorldState(sessionId);
    const embedding = await embedText(userText, target).catch(() => null);
    const memories = embedding ? await matchMemories(sessionId, embedding, TOP_K).catch(() => []) : [];
    return capBlock(formatWorldContext(state, memories), 2800);
  } catch (err) {
    console.warn('[world] context skipped:', err instanceof Error ? err.message : err);
    return '';
  }
}

/** Asks the model for update_world_state / add_memory calls and writes the ones it returns. */
export async function commitWorldTurn(sessionId: string, userText: string, assistantText: string, target: WorldTurnTarget): Promise<void> {
  try {
    const apiKey = target.apiKey?.trim() ?? '';
    if (!apiKey || !assistantText.trim()) return;
    const state = await ensureWorldState(sessionId);
    const calls = await requestWorldToolCalls({
      provider: target.provider,
      model: target.model,
      apiKey,
      baseUrl: target.baseUrl,
      userText,
      assistantText,
      state,
    });
    for (const call of calls) {
      if (call.name === 'update_world_state') {
        const patch = worldPatchFromArgs(call.args);
        if (patch) await applyWorldPatch(sessionId, patch.stats, patch.achievements);
        continue;
      }
      const content = memoryFromArgs(call.args);
      if (!content) continue;
      const embedding = await embedText(content, target);
      if (embedding) await insertMemory(sessionId, content, embedding);
    }
  } catch (err) {
    console.warn('[world] update skipped:', err instanceof Error ? err.message : err);
  }
}

function capBlock(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars - 1);
  const breakAt = slice.lastIndexOf('\n');
  return (breakAt > maxChars * 0.6 ? slice.slice(0, breakAt) : slice).trimEnd() + '…';
}
