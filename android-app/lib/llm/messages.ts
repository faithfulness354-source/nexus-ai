import { GROQ_DEFAULT_MODEL, OPENROUTER_DEFAULT_MODEL, usableCustomModel, usableOpenRouterModel, type LLMMessage } from '../types';
import { stripPromptLeak } from '@/lib/prompt-leak';

export type ProviderImage = { mimeType: string; data: string };

const IMAGE_MIME = /^image\/(png|jpeg|webp|gif)$/;

const CHAT_IMAGE_BYTES = 4 * 1024 * 1024;

function canonicalMime(mime: string): string {
  const value = mime.toLowerCase().split(';')[0].trim();
  if (value === 'image/jpg' || value === 'image/pjpeg') return 'image/jpeg';
  return value;
}

export function usableImages(images?: ProviderImage[]): ProviderImage[] {
  const ready: ProviderImage[] = [];
  for (const image of images ?? []) {
    const mimeType = canonicalMime(image.mimeType ?? '');
    const data = (image.data ?? '').replace(/\s/g, '');
    if (!IMAGE_MIME.test(mimeType) || !data) continue;
    if (Math.floor((data.length * 3) / 4) > CHAT_IMAGE_BYTES) continue;
    ready.push({ mimeType, data });
  }
  return ready.slice(0, 1);
}

export function lastRoleIndex(messages: Array<{ role: string }>, role: string): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === role) return i;
  }
  return -1;
}

/** Chat-completions `content` has to be a string. Null, missing, and part-objects collapse to text. */
export function messageContent(value: unknown, depth = 0): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (depth > 6) return '';
  if (Array.isArray(value)) {
    return value.map((part) => messageContent(part, depth + 1)).map((part) => part.trim()).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.type === 'image_url' || record.type === 'image' || record.type === 'input_audio') return '';
    if ('text' in record && record.text != null) return messageContent(record.text, depth + 1);
    if ('content' in record && record.content != null) return messageContent(record.content, depth + 1);
    if (typeof record.value === 'string') return record.value;
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return '';
}

/** One system message, then alternating user/assistant turns that start with the user. */
export function normalizeProviderMessages(messages: LLMMessage[]): LLMMessage[] {
  const live = spliceDeletedMessages(messages);
  const system = live
    .filter((message) => message.role === 'system' && !isDeletedMessage(message))
    .map((message) => messageContent(message.content).trim())
    .filter(Boolean)
    .join('\n\n');
  const chat: LLMMessage[] = [];
  for (const message of live) {
    if (message.role === 'system' || isDeletedMessage(message)) continue;
    const content = messageContent(message.content).trim();
    if (!content) continue;
    const role: LLMMessage['role'] = message.role === 'assistant' ? 'assistant' : 'user';
    const spoken = stripPromptLeak(content);
    if (!spoken) continue;
    const previous = chat[chat.length - 1];
    if (previous && previous.role === role) previous.content = `${previous.content}\n\n${spoken}`;
    else chat.push({ role, content: spoken });
  }
  while (chat.length > 1 && chat[0].role === 'assistant') chat.shift();
  const out: LLMMessage[] = [];
  if (system) out.push({ role: 'system', content: system });
  for (const message of chat) {
    const content = dropSystemEcho(system, message.content);
    if (content) out.push({ role: message.role, content });
  }
  return out;
}

/** Removes a copied system prompt from a dialogue turn. The system text stays on the system message only. */
function dropSystemEcho(system: string, content: string): string {
  const prompt = system.trim();
  const spoken = stripPromptLeak(content);
  if (!prompt || !spoken) return spoken;
  const trimmed = spoken.trimStart();
  if (trimmed.startsWith(prompt)) return trimmed.slice(prompt.length).trim();
  const head = prompt.slice(0, 120);
  const at = head.length >= 40 ? spoken.indexOf(head) : -1;
  if (at < 0) return spoken;
  return `${spoken.slice(0, at)}${spoken.slice(at + prompt.length)}`.trim();
}

/** True when a stored or in-memory turn was soft-deleted and must not be sent. */
export function isDeletedMessage(message: unknown): boolean {
  if (!message || typeof message !== 'object') return false;
  const flag = (message as { deleted?: unknown }).deleted;
  return flag === true || flag === 1 || flag === '1' || flag === 'true';
}

/** Removes every turn with `deleted === true` before history is serialized or rendered. */
export function spliceDeletedMessages<T>(messages: T[]): T[] {
  const next = Array.isArray(messages) ? [...messages] : [];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (isDeletedMessage(next[i])) next.splice(i, 1);
  }
  return next;
}

/**
 * History that is safe to put in a chat-completions body.
 * Deleted, null, and non-string turns are removed. Every remaining content is a primitive string.
 */
export function sanitizeChatHistory(messages: unknown): LLMMessage[] {
  if (!Array.isArray(messages)) return [];
  const clean: LLMMessage[] = [];
  for (const item of spliceDeletedMessages(messages)) {
    if (!item || typeof item !== 'object' || isDeletedMessage(item)) continue;
    const record = item as { role?: unknown; content?: unknown };
    const roleName = typeof record.role === 'string' ? record.role.toLowerCase() : '';
    const role: LLMMessage['role'] | '' = roleName === 'assistant' || roleName === 'model'
      ? 'assistant'
      : roleName === 'system'
        ? 'system'
        : roleName === 'user'
          ? 'user'
          : '';
    if (!role) continue;
    const raw = messageContent(record.content).trim();
    const content = role === 'system' ? raw : stripPromptLeak(raw);
    if (!content) continue;
    clean.push({ role, content });
  }
  return clean;
}

/** Request model, then CUSTOM_MODEL_NAME, then the saved provider model, then the Groq default. */
export function resolveCustomModel(requested?: string | null, configured?: string | null): string {
  return usableCustomModel(requested) || usableCustomModel(process.env.CUSTOM_MODEL_NAME) || usableCustomModel(configured) || GROQ_DEFAULT_MODEL;
}

/** Request model, then OPENROUTER_MODEL_NAME, then the saved provider model, then a live OpenRouter id. */
export function resolveOpenRouterModel(requested?: string | null, configured?: string | null): string {
  return usableOpenRouterModel(requested) || usableOpenRouterModel(process.env.OPENROUTER_MODEL_NAME) || usableOpenRouterModel(configured) || OPENROUTER_DEFAULT_MODEL;
}

/** OpenAI chat-completions body. Optional penalties are omitted so strict proxies do not reject zeros. */
export function openAIChatBody(params: {
  model: string;
  messages: LLMMessage[];
  temperature: number;
  topP: number;
  maxTokens: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  images?: ProviderImage[];
}): Record<string, unknown> {
  const messages = normalizeProviderMessages(sanitizeChatHistory(params.messages)).map((message) => ({
    role: message.role,
    content: String(messageContent(message.content)),
  }));
  const body: Record<string, unknown> = {
    model: params.model,
    messages,
    stream: true,
    temperature: params.temperature,
    top_p: params.topP,
    max_tokens: params.maxTokens,
  };
  if (params.frequencyPenalty) body.frequency_penalty = params.frequencyPenalty;
  if (params.presencePenalty) body.presence_penalty = params.presencePenalty;
  return body;
}

export function isOpenAIProxy(baseUrl?: string | null): boolean {
  const value = baseUrl?.trim() ?? '';
  if (!value) return false;
  return /\/v1\/?$/i.test(value) || /chat\/completions/i.test(value);
}
