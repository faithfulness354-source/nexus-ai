export interface GalleryImage {
  id: string;
  label: string;
  url: string;
  cloud_storage_path: string | null;
  isPublic: boolean;
}

export interface CharacterCard {
  id: string;
  name: string;
  title?: string;
  gallery?: GalleryImage[];
  sceneImages?: boolean;
  summary: string;
  personality: string;
  scenario: string;
  initialMessage: string;
  exampleDialogue: string;
  customRules: string;
  systemPrompt: string;
  creatorNotes: string;
  tags: string[];
  avatar: string | null;
  banner: string | null;
  creator: string;
  nsfw: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChubV2Card {
  name?: string;
  description?: string;
  personality?: string;
  first_mes?: string;
  scenario?: string;
  mes_example?: string;
  system_prompt?: string;
  tags?: string[];
  creator_notes?: string;
  extensions?: Record<string, any>;
  character_book?: any;
  spec?: string;
  spec_version?: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  model: string | null;
  tokenCount: number;
  editHistory: Array<{ content: string; editedAt: string }>;
  createdAt: string;
  index: number;
  deleted?: boolean;
}

export interface ChatSessionData {
  id: string;
  characterId: string;
  title: string;
  model: string;
  provider: string;
  branchedFromSessionId: string | null;
  branchedAtMessageIndex: number | null;
  createdAt: string;
  updatedAt: string;
  character?: CharacterCard;
  messages?: ChatMessage[];
  generationSettings?: GenSettings | null;
}

export interface GenSettings {
  id: string;
  sessionId: string;
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxTokens: number;
  forbiddenWords: string[];
}

export interface MeterDef {
  name: string;
  min: number;
  max: number;
  default: number;
  color?: string;
}

export interface MeterSnapshot {
  [meterName: string]: number;
}

export interface ProviderConfigData {
  id: string;
  provider: string;
  apiKey: string | null;
  baseUrl: string | null;
  defaultModel: string | null;
  isActive: boolean;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// NovelAI is the paid chat provider. Gemini remains available only when an admin activates it in Settings.
export const DEFAULT_PROVIDER = 'NOVELAI';
export const DEFAULT_MODEL = 'glm-4.6-xialong-v1';
/** Gemini-only fallback for the Gemini transport — never used as the app-wide chat default. */
export const GEMINI_DEFAULT_MODEL = 'gemini-flash-latest';
/** Current Groq production and preview chat models. Speech and guard models are omitted. */
export const GROQ_CHAT_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'allam-2-7b'];
/** Used when a custom or Groq request has no current model of its own. */
export const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-20b';
/** Seed OpenRouter chat ids when the live catalog request fails. */
export const OPENROUTER_CHAT_MODELS = ['anthropic/claude-sonnet-4', 'meta-llama/llama-3.3-70b-instruct', 'openai/gpt-4o-mini'];
/** Used when an OpenRouter request has no current vendor/model id. */
export const OPENROUTER_DEFAULT_MODEL = 'anthropic/claude-sonnet-4';
const RETIRED_GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.3-70b-specdec',
  'llama-3.1-8b-instant',
  'llama-3.1-70b-versatile',
  'llama-3.1-70b-specdec',
  'qwen/qwen3.6-27b',
  'qwen/qwen3-32b',
  'groq/compound',
  'groq/compound-mini',
];

const RETIRED_OPENROUTER_MODELS = [
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3-opus',
  'anthropic/claude-3-haiku',
  'meta-llama/llama-3.1-405b-instruct',
  'meta-llama/llama-3.1-70b-instruct',
  'openai/gpt-4',
  'openai/gpt-4-turbo',
  'openai/gpt-3.5-turbo',
  'google/gemini-pro',
  'google/gemini-flash-1.5',
];

function bareModelId(model?: string | null): string {
  return (model ?? '').trim().replace(/^["']+|["']+$/g, '').trim();
}

/** NovelAI id for the selected chat model. Display names map to the generation id; nothing is substituted. */
export function novelApiModel(model?: string | null): string {
  const value = bareModelId(model);
  const key = value.toLowerCase().replace(/[\s_]+/g, '-');
  if (/llama-?3-?erato/.test(key)) return 'llama-3-erato-v1';
  return value;
}

/** Drops a blank id or a Groq model that has already been shut off. */
export function usableCustomModel(model?: string | null): string {
  const value = bareModelId(model);
  if (!value || RETIRED_GROQ_MODELS.includes(value.toLowerCase())) return '';
  return value;
}

/** Drops a blank, retired, or non-vendor id. OpenRouter rejects those with 404. */
export function usableOpenRouterModel(model?: string | null): string {
  const value = bareModelId(model);
  const key = value.toLowerCase();
  if (!value || RETIRED_GROQ_MODELS.includes(key) || RETIRED_OPENROUTER_MODELS.includes(key)) return '';
  if (!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(value) || key.endsWith(':batch')) return '';
  return value;
}

/** Keeps a saved default only when that provider can still call it. */
export function usableModelForProvider(provider: string, model?: string | null): string {
  if (provider === 'GEMINI') return usableGeminiModel(model);
  if (provider === 'OPENROUTER') return usableOpenRouterModel(model);
  if (provider === 'CUSTOM') return usableCustomModel(model);
  if (provider === 'NOVELAI') return novelApiModel(model);
  return bareModelId(model);
}
// Tried in order when the selected Gemini model is retired, rate-limited or overloaded.
export const GEMINI_FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite'];
export const SUPPORTED_PROVIDERS = ['GEMINI', 'ANTHROPIC', 'OPENROUTER', 'CUSTOM', 'NOVELAI'] as const;

export function normalizeProvider(provider?: string | null): string {
  const p = (provider ?? '').toUpperCase();
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(p) ? p : DEFAULT_PROVIDER;
}

export function isGeminiModel(model?: string | null): boolean {
  return !!model && /^(gemini|gemma)-/i.test(model);
}

// Versioned models Google has shut off for new API keys (they return 404). Saved values are mapped to DEFAULT_MODEL.
export const RETIRED_GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'];

/** Returns a working Gemini model id, replacing missing/retired/non-Gemini values with GEMINI_DEFAULT_MODEL. */
export function usableGeminiModel(model?: string | null): string {
  return isGeminiModel(model) && !RETIRED_GEMINI_MODELS.includes(model as string) ? (model as string) : GEMINI_DEFAULT_MODEL;
}

/** True when a model id is a Google Gemini / Gemma SKU (including OpenRouter google/gemini*). */
export function isGeminiFamilyModel(model?: string | null): boolean {
  const value = bareModelId(model).toLowerCase();
  if (!value) return false;
  return isGeminiModel(value) || value.startsWith('google/gemini') || value.startsWith('google/gemma') || value.includes('gemini');
}

export const PROVIDER_MODELS: Record<string, string[]> = {
  GEMINI: ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest', 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3-flash-preview', 'gemini-3.1-pro-preview'],
  ANTHROPIC: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  OPENROUTER: OPENROUTER_CHAT_MODELS,
  CUSTOM: GROQ_CHAT_MODELS,
  NOVELAI: ['glm-4.6-xialong-v1', 'xialong-v1', 'llama-3-erato-v1'],
};

export const PROVIDER_LABELS: Record<string, string> = {
  ANTHROPIC: 'Anthropic',
  GEMINI: 'Google Gemini',
  OPENROUTER: 'OpenRouter',
  CUSTOM: 'Custom Endpoint',
  NOVELAI: 'NovelAI',
};

export const CONTEXT_WINDOWS: Record<string, number> = {
  'claude-sonnet-4-20250514': 200000,
  'claude-3-5-sonnet-20241022': 200000,
  'claude-3-5-haiku-20241022': 200000,
  'claude-3-opus-20240229': 200000,
  'gemini-3.8-flash': 1048576,
  'gemini-3.5-flash-lite': 1048576,
  'gemini-flash-lite-latest': 1048576,
  'gemini-3-flash-preview': 1048576,
  'gemini-3.1-pro-preview': 1048576,
  'gemini-flash-latest': 1048576,
  'gemini-pro-latest': 1048576,
};
