import { LLMMessage, DEFAULT_MODEL, GEMINI_FALLBACK_MODELS } from '../types';
import { isOpenAIProxy, lastRoleIndex, normalizeProviderMessages, usableImages, type ProviderImage } from './messages';
import { streamOpenAICompatible } from './openai-compatible';

// Retired (404), rate-limited (429) or overloaded (5xx) models fall through to the next candidate.
const RETRYABLE = new Set([404, 429, 500, 503]);

interface Params {
  messages: LLMMessage[];
  model: string;
  apiKey: string;
  baseUrl?: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  frequencyPenalty: number;
  presencePenalty: number;
  images?: ProviderImage[];
}

export function streamGemini(params: Params): ReadableStream {
  const candidates = Array.from(new Set([params.model || DEFAULT_MODEL, ...GEMINI_FALLBACK_MODELS]));

  if (isOpenAIProxy(params.baseUrl)) return streamOpenAICompatible(params);

  const normalized = normalizeProviderMessages(params.messages);
  const systemMsg = normalized.find((m: LLMMessage) => m.role === 'system');
  const images = usableImages(params.images);
  const chat = normalized.filter((m: LLMMessage) => m.role !== 'system');
  const lastUser = lastRoleIndex(chat, 'user');
  const contents = chat.map((m: LLMMessage, index: number) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [
      { text: m.content },
      ...(index === lastUser ? images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } })) : []),
    ],
  }));

  const makeBody = () => JSON.stringify({
    ...(systemMsg?.content ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
    contents,
    generationConfig: {
      temperature: params.temperature,
      topP: params.topP,
      maxOutputTokens: params.maxTokens,
    },
  });

  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        let res: Response | null = null;
        let lastErr = '';
        if (!contents.length || contents[0].role !== 'user') {
          controller.enqueue(encoder.encode('[Error: The chat request had no user message to send.]'));
          return;
        }
        const root = (params.baseUrl?.trim() || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '').replace(/\/v1beta$/i, '');
        for (const model of candidates) {
          const url = `${root}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
          const attempt = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': (params.apiKey ?? '').trim(),
            },
            body: makeBody(),
          });
          if (attempt.ok) { res = attempt; break; }
          lastErr = `${attempt.status} - ${await attempt.text().catch(() => 'Unknown error')}`;
          console.error(`[gemini] model ${model} failed: ${lastErr.slice(0, 300)}`);
          if (!RETRYABLE.has(attempt.status)) break;
        }

        if (!res) {
          controller.enqueue(encoder.encode(`[Error: ${lastErr}]`));
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) { controller.close(); return; }
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.slice(6));
                const parts: any[] = parsed?.candidates?.[0]?.content?.parts ?? [];
                const text = parts.filter((pt) => !pt?.thought).map((pt) => pt?.text ?? '').join('');
                if (text) controller.enqueue(encoder.encode(text));
              } catch { /* skip */ }
            }
          }
        }
      } catch (err: any) {
        controller.enqueue(encoder.encode(`[Error: ${err?.message ?? 'Connection failed'}]`));
      } finally {
        controller.close();
      }
    },
  });
}
