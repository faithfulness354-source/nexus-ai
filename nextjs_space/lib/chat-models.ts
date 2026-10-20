import { DEFAULT_MODEL, isGeminiFamilyModel } from '@/lib/types';

export const CHAT_MODEL_STORAGE_KEY = 'nexus:preferred-chat-model';
export const CHAT_PROVIDER_STORAGE_KEY = 'nexus:preferred-chat-provider';

function canUseStorage(): boolean {
  return typeof window !== 'undefined';
}

/** Reads a previously chosen chat model from localStorage / sessionStorage. */
export function readStoredChatModel(): string | null {
  if (!canUseStorage()) return null;
  try {
    return localStorage.getItem(CHAT_MODEL_STORAGE_KEY) ?? sessionStorage.getItem(CHAT_MODEL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredChatModel(model: string, provider?: string) {
  if (!canUseStorage() || !model.trim()) return;
  try {
    localStorage.setItem(CHAT_MODEL_STORAGE_KEY, model);
    sessionStorage.setItem(CHAT_MODEL_STORAGE_KEY, model);
    if (provider) {
      localStorage.setItem(CHAT_PROVIDER_STORAGE_KEY, provider);
      sessionStorage.setItem(CHAT_PROVIDER_STORAGE_KEY, provider);
    }
  } catch {
    /* private mode */
  }
}

/** Drops a Gemini (or empty) stored preference so chat never rehydrates it. */
export function purgeStoredChatModelIfStale(activeModels: string[]) {
  if (!canUseStorage()) return;
  try {
    for (const store of [localStorage, sessionStorage]) {
      const saved = store.getItem(CHAT_MODEL_STORAGE_KEY);
      if (!saved) continue;
      if (isGeminiFamilyModel(saved) || (activeModels.length > 0 && !activeModels.includes(saved))) {
        store.removeItem(CHAT_MODEL_STORAGE_KEY);
      }
    }
  } catch {
    /* private mode */
  }
}

/**
 * Picks a model that exists on the paid provider list.
 * Gemini family ids and unknown ids are replaced with the first active model.
 */
export function pickActiveChatModel(candidates: Array<string | null | undefined>, activeModels: string[]): string {
  const list = activeModels.map((model) => model.trim()).filter(Boolean);
  const fallback = list[0] || DEFAULT_MODEL;
  if (!list.length) return fallback;
  for (const candidate of candidates) {
    const value = (candidate ?? '').trim();
    if (!value || isGeminiFamilyModel(value)) continue;
    if (list.includes(value)) return value;
  }
  return fallback;
}
