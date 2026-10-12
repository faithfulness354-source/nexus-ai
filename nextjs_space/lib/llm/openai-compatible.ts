import 'server-only';
import { LLMMessage } from '../types';
import { openAIChatBody, resolveCustomModel, type ProviderImage } from './messages';

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

// Generic OpenAI-compatible chat-completions client, used only for user-defined Custom endpoints/proxies.
export function streamOpenAICompatible(params: Params): ReadableStream {
  const root = params?.baseUrl?.trim() || process.env.GROQ_BASE_URL?.trim() || 'https://api.groq.com/openai/v1';
  const url = `${root.replace(/\/+$/, '')}/chat/completions`;

  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const model = resolveCustomModel(params.model);
      if (!model) {
        controller.enqueue(encoder.encode('[Error: No custom model is configured. Choose a model in chat or set CUSTOM_MODEL_NAME.]'));
        controller.close();
        return;
      }
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(params.apiKey?.trim() ? { Authorization: `Bearer ${params.apiKey.trim()}` } : {}),
          },
          body: JSON.stringify(openAIChatBody({ ...params, model, images: params.images })),
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
