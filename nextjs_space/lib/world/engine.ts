import 'server-only';
import { embedText } from './embed';
import { applyWorldPatch, ensureWorldState, insertMemory, matchMemories } from './store';
import { requestWorldToolCalls } from './tools';
import { formatWorldContext, memoryFromArgs, worldPatchFromArgs } from './types';

const TOP_K = 3;

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
    return formatWorldContext(state, memories);
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
    const beat = `User: ${clip(userText, 600)}\nAssistant: ${clip(assistantText, 1200)}`;
    const beatEmbedding = await embedText(beat, target);
    if (beatEmbedding) await insertMemory(sessionId, beat, beatEmbedding);
  } catch (err) {
    console.warn('[world] update skipped:', err instanceof Error ? err.message : err);
  }
}

function clip(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}
