import 'server-only';
import { LLMMessage } from '../types';
import { openAIChatBody, resolveOpenRouterModel, type ProviderImage } from './messages';

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

export function streamOpenRouter(params: Params): ReadableStream {
  const url = 'https://openrouter.ai/api/v1/chat/completions';

  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${params.apiKey}`,
            'HTTP-Referer': 'https://nexus-roleplay.app',
          },
          body: JSON.stringify(openAIChatBody({ ...params, model: resolveOpenRouterModel(params.model), images: params.images })),
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
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const content = parsed?.choices?.[0]?.delta?.content ?? '';
                if (content) controller.enqueue(encoder.encode(content));
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
