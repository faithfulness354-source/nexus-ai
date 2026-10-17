import 'server-only';
import { LLMMessage, ProviderConfigData, GenSettings, DEFAULT_MODEL, PROVIDER_MODELS, normalizeProvider, usableGeminiModel } from '../types';
import { resolveCustomModel, resolveOpenRouterModel, sanitizeChatHistory, type ProviderImage } from './messages';
import { streamOpenAICompatible } from './openai-compatible';
import { streamAnthropic } from './anthropic';
import { streamGemini } from './gemini';
import { streamOpenRouter } from './openrouter';
import { NOVELAI_DEFAULT_MODEL, streamNovelAI } from './novelai';

export interface StreamOptions {
  messages: LLMMessage[];
  model: string;
  provider: string;
  config: ProviderConfigData;
  settings: Partial<GenSettings>;
  forbiddenWords?: string[];
  images?: ProviderImage[];
}

function outboundModel(provider: string, model: string): string {
  const name = normalizeProvider(provider);
  if (name === 'CUSTOM') return resolveCustomModel(model);
  if (name === 'OPENROUTER') return resolveOpenRouterModel(model);
  if (name === 'GEMINI') return usableGeminiModel(model);
  if (name === 'NOVELAI') return (typeof model === 'string' && model.trim()) || NOVELAI_DEFAULT_MODEL;
  const value = typeof model === 'string' ? model.trim() : '';
  return value || PROVIDER_MODELS.ANTHROPIC?.[0] || DEFAULT_MODEL;
}

export function createLLMStream(opts: StreamOptions): ReadableStream {
  const { provider, config, messages, model, settings, forbiddenWords, images } = opts;
  const apiKey = config?.apiKey ?? '';
  const savedBaseUrl = config?.baseUrl?.trim() ?? '';
  const baseUrl = savedBaseUrl || (normalizeProvider(provider) === 'CUSTOM'
    ? (process.env.GROQ_BASE_URL?.trim() || 'https://api.groq.com/openai/v1')
    : '');

  const params = {
    messages: sanitizeChatHistory(messages),
    model: outboundModel(provider, model),
    apiKey,
    baseUrl,
    temperature: settings?.temperature ?? 0.8,
    topP: settings?.topP ?? 0.95,
    maxTokens: settings?.maxTokens ?? 2048,
    frequencyPenalty: settings?.frequencyPenalty ?? 0,
    presencePenalty: settings?.presencePenalty ?? 0,
    images,
  };

  let stream: ReadableStream;

  switch (normalizeProvider(provider)) {
    case 'ANTHROPIC':
      stream = streamAnthropic(params);
      break;
    case 'OPENROUTER':
      stream = streamOpenRouter(params);
      break;
    case 'CUSTOM':
      stream = streamOpenAICompatible(params);
      break;
    case 'NOVELAI':
      stream = streamNovelAI(params);
      break;
    case 'GEMINI':
    default:
      stream = streamGemini(params);
      break;
  }

  // Apply forbidden words filter
  if (forbiddenWords && forbiddenWords.length > 0) {
    return applyForbiddenWordsFilter(stream, forbiddenWords);
  }

  return stream;
}

function applyForbiddenWordsFilter(stream: ReadableStream, words: string[]): ReadableStream {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = stream.getReader();

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      let text = decoder.decode(value, { stream: true });
      for (const w of words) {
        if (w) {
          const regex = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          text = text.replace(regex, '[REDACTED]');
        }
      }
      controller.enqueue(encoder.encode(text));
    },
  });
}
