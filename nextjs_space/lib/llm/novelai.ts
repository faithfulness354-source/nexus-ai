import 'server-only';
import type { LLMMessage } from '../types';

const GENERATE_URL = 'https://text.novelai.net/ai/generate';
export const NOVELAI_DEFAULT_MODEL = 'glm-4.6-xialong-v1';
const MODEL_ATTEMPTS = [NOVELAI_DEFAULT_MODEL, 'xialong-v1', 'llama-3-erato-v1'];

interface Params {
  messages: LLMMessage[];
  model: string;
  apiKey: string;
  temperature: number;
  topP: number;
  maxTokens: number;
}

/** Story prompt: system card and world state, then the transcript, ending where the character continues. */
export function novelPrompt(messages: LLMMessage[]): string {
  const parts: string[] = [];
  for (const message of messages) {
    const text = message.content?.trim();
    if (!text) continue;
    if (message.role === 'system') parts.push(text);
    else if (message.role === 'assistant') parts.push(`Character: ${text}`);
    else parts.push(`User: ${text}`);
  }
  parts.push('Character:');
  return parts.join('\n\n');
}

export function streamNovelAI(params: Params): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const apiKey = (params.apiKey || process.env.NOVELAI_API_KEY || '').trim();
      if (!apiKey) {
        controller.enqueue(encoder.encode('[Error: NOVELAI_API_KEY is not set.]'));
        controller.close();
        return;
      }
      try {
        const text = await generate(params, apiKey);
        if (text) controller.enqueue(encoder.encode(text));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'NovelAI request failed';
        controller.enqueue(encoder.encode(`[Error: ${message}]`));
      } finally {
        controller.close();
      }
    },
  });
}

async function generate(params: Params, apiKey: string): Promise<string> {
  const requested = params.model?.trim();
  const models = [requested, ...MODEL_ATTEMPTS].filter((model, index, all): model is string => !!model && all.indexOf(model) === index);
  let lastError = 'NovelAI request failed';
  for (const model of models) {
    const res = await fetch(GENERATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: novelPrompt(params.messages),
        model,
        parameters: {
          use_string: true,
          return_full_text: false,
          temperature: params.temperature,
          top_p: params.topP,
          min_length: 40,
          max_length: Math.min(1024, Math.max(150, Math.floor(params.maxTokens) || 1024)),
          repetition_penalty: 1.1,
        },
      }),
      signal: AbortSignal.timeout(60000),
    });
    const raw = await res.text();
    if (res.ok) return readOutput(raw);
    lastError = `${res.status} - ${raw.slice(0, 400)}`;
    if (res.status !== 400 && res.status !== 404) break;
  }
  throw new Error(lastError);
}

function readOutput(raw: string): string {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw.trim();
  }
  const body = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  const direct = firstString(body.output) || firstString(body.text);
  if (direct) return direct.replace(/^\s*Character:\s*/i, '').trim();
  const choices = body.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
    const choice = choices[0] as Record<string, unknown>;
    const message = choice.message && typeof choice.message === 'object' ? choice.message as Record<string, unknown> : null;
    const text = firstString(choice.text) || firstString(message?.content);
    if (text) return text.replace(/^\s*Character:\s*/i, '').trim();
  }
  return '';
}

function firstString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
