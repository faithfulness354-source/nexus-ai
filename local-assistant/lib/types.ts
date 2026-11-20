import { COMFY_DEFAULT_BASE_URL } from './comfy-config';
import {
  FORGE_DEFAULT_BASE_URL,
  FORGE_IMG2IMG_CFG,
  FORGE_IMG2IMG_DENOISE,
  FORGE_IMG2IMG_SAMPLER,
  FORGE_IMG2IMG_STEPS,
} from './forge-config';
import { STYLE_NEGATIVE_PROMPT } from './image-style';
import { DEFAULT_OLLAMA_MODEL } from './system-prompt';
import { VENICE_DEFAULT_IMAGE_MODEL } from './venice-config';

export type TextBackend = 'ollama' | 'openai-compat';
export type ImageBackend = 'venice' | 'a1111' | 'comfyui';
export type InputMode = 'text' | 'image';

export interface LocalSettings {
  textBackend: TextBackend;
  ollamaBaseUrl: string;
  openaiCompatBaseUrl: string;
  model: string;
  imageBackend: ImageBackend;
  a1111BaseUrl: string;
  comfyBaseUrl: string;
  /** Venice image model id (server uses VENICE_IMAGE_MODEL / default when empty). */
  veniceImageModel: string;
  negativePrompt: string;
  steps: number;
  cfgScale: number;
  width: number;
  height: number;
  samplerName: string;
  /** Denoising strength for img2img (0–1). */
  denoise: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  imageDataUrl?: string;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

export const DEFAULT_SETTINGS: LocalSettings = {
  textBackend: 'ollama',
  ollamaBaseUrl: 'http://localhost:11434',
  openaiCompatBaseUrl: 'http://localhost:1234/v1',
  model: DEFAULT_OLLAMA_MODEL,
  imageBackend: 'venice',
  a1111BaseUrl: FORGE_DEFAULT_BASE_URL,
  comfyBaseUrl: COMFY_DEFAULT_BASE_URL,
  veniceImageModel: VENICE_DEFAULT_IMAGE_MODEL,
  negativePrompt: STYLE_NEGATIVE_PROMPT,
  steps: FORGE_IMG2IMG_STEPS,
  cfgScale: FORGE_IMG2IMG_CFG,
  width: 1024,
  height: 1024,
  samplerName: FORGE_IMG2IMG_SAMPLER,
  denoise: FORGE_IMG2IMG_DENOISE,
};

export const SETTINGS_STORAGE_KEY = 'local-assistant:settings';
export const CONVERSATIONS_STORAGE_KEY = 'local-assistant:conversations';
