'use client';

import {
  CONVERSATIONS_STORAGE_KEY,
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  type ChatMessage,
  type Conversation,
  type LocalSettings,
} from './types';

const MAX_CONVERSATIONS = 40;
const MAX_MESSAGES_PER_CONVERSATION = 120;
/** Keep recent assistant images; strip older ones first when quota is hit. */
const MAX_STORED_IMAGES_PER_CONVERSATION = 6;

export function loadSettings(): LocalSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as LocalSettings;
    if (parsed.imageBackend !== 'venice' && parsed.imageBackend !== 'a1111' && parsed.imageBackend !== 'comfyui') {
      parsed.imageBackend = 'venice';
    }
    if (!parsed.veniceImageModel) parsed.veniceImageModel = DEFAULT_SETTINGS.veniceImageModel;
    // One-time migrate old Forge default → Venice cloud (can switch back in Settings).
    try {
      const flag = 'local-assistant:migrated-venice-image-v1';
      if (!localStorage.getItem(flag)) {
        if (parsed.imageBackend === 'a1111') parsed.imageBackend = 'venice';
        localStorage.setItem(flag, '1');
      }
    } catch {
      /* ignore quota / private mode */
    }
    return parsed;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: LocalSettings) {
  if (typeof window === 'undefined') return;
  writeStorage(SETTINGS_STORAGE_KEY, JSON.stringify(settings), () => {
    // Settings are tiny — free space by pruning conversations / images, then retry.
    const pruned = pruneConversationsPayload(loadConversations(), 'aggressive');
    trySet(CONVERSATIONS_STORAGE_KEY, JSON.stringify(pruned));
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  });
}

export function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CONVERSATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConversations(conversations: Conversation[]) {
  if (typeof window === 'undefined') return;
  const normalized = normalizeConversations(conversations);
  writeStorage(CONVERSATIONS_STORAGE_KEY, JSON.stringify(normalized), () => {
    // Escalating shrink until the write fits (or we give up safely).
    for (const level of ['images', 'text-only', 'recent'] as const) {
      const pruned = pruneConversationsPayload(normalized, level);
      try {
        localStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(pruned));
        return;
      } catch (err) {
        if (!isQuotaExceededError(err)) throw err;
      }
    }
    localStorage.removeItem(CONVERSATIONS_STORAGE_KEY);
  });
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014 ||
    /quota/i.test(String(e.message || ''))
  );
}

function trySet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Safe localStorage write. On QuotaExceededError, run recover() to free space and retry.
 * Never rethrows — prevents UI crashes from storage pressure (usually large imageDataUrls).
 */
function writeStorage(key: string, value: string, recover: () => void) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    if (!isQuotaExceededError(err)) {
      console.warn(`[local-assistant] failed to write ${key}:`, err);
      return;
    }
    try {
      recover();
    } catch (retryErr) {
      console.warn(`[local-assistant] quota recovery failed for ${key}:`, retryErr);
      try {
        if (key === CONVERSATIONS_STORAGE_KEY) {
          localStorage.removeItem(CONVERSATIONS_STORAGE_KEY);
        } else {
          localStorage.removeItem(CONVERSATIONS_STORAGE_KEY);
          localStorage.setItem(key, value);
        }
      } catch (finalErr) {
        console.warn(`[local-assistant] could not free localStorage for ${key}:`, finalErr);
      }
    }
  }
}

function normalizeConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS)
    .map((conversation) => ({
      ...conversation,
      messages: Array.isArray(conversation.messages)
        ? conversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION)
        : [],
    }));
}

function stripOldImages(conversation: Conversation, keep: number): Conversation {
  let kept = 0;
  const messages: ChatMessage[] = [];
  for (let i = conversation.messages.length - 1; i >= 0; i -= 1) {
    const message = conversation.messages[i];
    if (message.imageDataUrl) {
      kept += 1;
      if (kept > keep) {
        const { imageDataUrl: _drop, ...rest } = message;
        messages.push(rest);
        continue;
      }
    }
    messages.push(message);
  }
  return { ...conversation, messages: messages.reverse() };
}

function pruneConversationsPayload(
  conversations: Conversation[],
  level: 'images' | 'text-only' | 'recent' | 'aggressive',
): Conversation[] {
  const sorted = normalizeConversations(conversations);

  if (level === 'images') {
    return sorted.map((conversation) =>
      stripOldImages(conversation, MAX_STORED_IMAGES_PER_CONVERSATION),
    );
  }

  const textOnly = sorted.map((conversation) => ({
    ...conversation,
    messages: conversation.messages.map(({ imageDataUrl: _drop, ...rest }) => rest),
  }));

  if (level === 'text-only') return textOnly;

  // recent + aggressive: keep a small recent slice
  return textOnly.slice(0, 8).map((conversation) => ({
    ...conversation,
    messages: conversation.messages.slice(-40),
  }));
}
