import 'server-only';
import { LLMMessage } from '../types';
import { lastRoleIndex, normalizeProviderMessages, usableImages, type ProviderImage } from './messages';

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

export function streamAnthropic(params: Params): ReadableStream {
  const url = `${(params?.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')}/v1/messages`;
  const normalized = normalizeProviderMessages(params.messages);
  const systemMsg = normalized.find((m: LLMMessage) => m.role === 'system');
  const chatMsgs = normalized.filter((m: LLMMessage) => m.role !== 'system');

  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': params.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: params.model,
            system: systemMsg?.content ?? '',
            messages: chatMsgs.map((m: LLMMessage, index: number) => {
              const images = index === lastRoleIndex(chatMsgs, 'user') ? usableImages(params.images) : [];
              if (!images.length) return { role: m.role, content: m.content };
              return {
                role: 'user',
                content: [
                  { type: 'text', text: m.content },
                  ...images.map((image) => ({ type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.data } })),
                ],
              };
            }),
            stream: true,
            max_tokens: params.maxTokens,
            temperature: params.temperature,
            top_p: params.topP,
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => 'Unknown error');
          controller.enqueue(encoder.encode(`[Error: ${res.status} - ${errText}]`));
          controller.close();
          return;
        }

        const reader = res?.body?.getReader();
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
                if (parsed?.type === 'content_block_delta') {
                  const text = parsed?.delta?.text ?? '';
                  if (text) controller.enqueue(encoder.encode(text));
                }
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
