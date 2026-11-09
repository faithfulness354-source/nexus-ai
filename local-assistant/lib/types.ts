export type TextBackend = 'ollama' | 'openai-compat';
export type ImageBackend = 'a1111' | 'comfyui';
export type InputMode = 'text' | 'image';

export interface LocalSettings {
  textBackend: TextBackend;
  ollamaBaseUrl: string;
  openaiCompatBaseUrl: string;
  model: string;
  imageBackend: ImageBackend;
  a1111BaseUrl: string;
  comfyBaseUrl: string;
  negativePrompt: string;
  steps: number;
  cfgScale: number;
  width: number;
  height: number;
  samplerName: string;
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
  model: '',
  imageBackend: 'a1111',
  a1111BaseUrl: 'http://127.0.0.1:7860',
  comfyBaseUrl: 'http://127.0.0.1:8188',
  negativePrompt: 'lowres, bad anatomy, blurry, watermark, text',
  steps: 30,
  cfgScale: 7,
  width: 512,
  height: 768,
  samplerName: 'Euler a',
};

export const SETTINGS_STORAGE_KEY = 'local-assistant:settings';
export const CONVERSATIONS_STORAGE_KEY = 'local-assistant:conversations';
