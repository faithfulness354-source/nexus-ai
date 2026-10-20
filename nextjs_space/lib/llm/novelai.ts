import 'server-only';
import { novelApiModel, type LLMMessage } from '../types';
import { estimateTokens } from '@/lib/tokens';
import { novelUserStopSequences } from '@/lib/llm/resolve';
import { isDeletedMessage, messageContent, spliceDeletedMessages } from './messages';
import { PROSE_DIRECTIVE, stripExampleDialogue } from '@/lib/payload-router';
import { stripPromptLeak } from '@/lib/prompt-leak';

const GENERATE_URL = 'https://text.novelai.net/ai/generate';
const ENCODE_URL = 'https://text.novelai.net/ai/encode';
/** NovelAI rejects longer single-call lengths. Continuations cover the rest of the reply. */
export const NOVELAI_MAX_LENGTH = 200;
const NOVELAI_MIN_LENGTH = 100;
const MIN_RESPONSE_TOKENS = 400;
const MAX_CONTINUATIONS = 4;

interface Params {
  messages: LLMMessage[];
  model: string;
  apiKey: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  userName?: string;
}

/** Story prompt. System instructions stay in the prefix. Dialogue lines are only user and character turns. */
export function novelPrompt(messages: LLMMessage[]): string {
  const system: string[] = [];
  const turns: string[] = [];
  for (const message of spliceDeletedMessages(messages)) {
    if (isDeletedMessage(message)) continue;
    const text = messageContent(message.content).trim();
    if (!text) continue;
    if (message.role === 'system') {
      system.push(stripExampleDialogue(text));
      continue;
    }
    const spoken = stripPromptLeak(text);
    if (!spoken) continue;
    turns.push(message.role === 'assistant' ? `Character: ${spoken}` : `User: ${spoken}`);
  }
  const directive = system.join('\n\n');
  const prefix = directive.includes(PROSE_DIRECTIVE) ? directive : `${directive}\n\n${PROSE_DIRECTIVE}`;
  return [...(prefix.trim() ? [prefix] : []), ...turns, 'Character:'].join('\n\n');
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
      let rawFull = '';
      let visible = '';
      try {
        const opening = novelPrompt(params.messages);
        let prompt = opening;
        const stops = novelUserStopSequences(params.userName);
        const stopIds = await encodeStopSequences(apiKey, stops);
        const target = Math.max(MIN_RESPONSE_TOKENS, Math.floor(params.maxTokens) || MIN_RESPONSE_TOKENS);
        for (let call = 0; call <= MAX_CONTINUATIONS; call++) {
          const chunk = await generate(params, apiKey, prompt, stopIds);
          const cut = cutAtStop(chunk, stops);
          const piece = cut.text.replace(/^\s*Character:\s*/i, '');
          if (!piece.trim()) break;
          rawFull = appendSeamless(rawFull, call === 0 ? piece.trimStart() : piece);
          const nextVisible = stripPromptLeak(rawFull);
          const added = nextVisible.startsWith(visible) ? nextVisible.slice(visible.length) : nextVisible;
          visible = nextVisible;
          if (added) controller.enqueue(encoder.encode(added));
          if (cut.stopped || estimateTokens(visible) >= target) break;
          prompt = `${opening}${visible}`;
        }
      } catch (err: unknown) {
        if (!visible) {
          const message = err instanceof Error ? err.message : 'NovelAI request failed';
          controller.enqueue(encoder.encode(`[Error: ${message}]`));
        }
      } finally {
        controller.close();
      }
    },
  });
}

async function generate(params: Params, apiKey: string, input: string, stopIds: number[][]): Promise<string> {
  const parameters: Record<string, unknown> = {
    use_string: true,
    return_full_text: false,
    temperature: params.temperature,
    top_p: params.topP,
    min_length: NOVELAI_MIN_LENGTH,
    max_length: NOVELAI_MAX_LENGTH,
    repetition_penalty: 1.1,
  };
  if (stopIds.length) parameters.stop_sequences = stopIds;
  const res = await fetch(GENERATE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input,
      model: novelApiModel(params.model),
      parameters,
    }),
    signal: AbortSignal.timeout(60000),
  });
  const raw = await res.text();
  if (res.ok) return readOutput(raw, input);
  throw new Error(`${res.status} - ${raw.slice(0, 400)}`);
}

/** NovelAI returns the request text in `output` unless it is cut off. That prefix is the system prompt, not a reply. */
export function completionOnly(input: string, output: string): string {
  if (!output) return '';
  if (input && output.startsWith(input)) return output.slice(input.length);
  const prompt = input.trimEnd();
  if (!prompt) return output;
  const head = prompt.slice(0, Math.min(160, prompt.length));
  if (head.length < 40 || !output.startsWith(head)) return output;
  let i = 0;
  let o = 0;
  while (i < prompt.length && o < output.length) {
    if (prompt[i] === output[o]) {
      i += 1;
      o += 1;
      continue;
    }
    if (/\s/.test(prompt[i])) { i += 1; continue; }
    if (/\s/.test(output[o])) { o += 1; continue; }
    break;
  }
  if (i >= prompt.length - 8) return output.slice(o);
  return output;
}

function cutAtStop(text: string, stops: string[]): { text: string; stopped: boolean } {
  let at = -1;
  for (const stop of stops) {
    if (stop === '\n' || stop === '\n\n') continue;
    const found = text.indexOf(stop);
    if (found >= 0 && (at < 0 || found < at)) at = found;
  }
  if (at < 0) return { text, stopped: false };
  return { text: text.slice(0, at).trimEnd(), stopped: true };
}

async function encodeStopSequences(apiKey: string, stops: string[]): Promise<number[][]> {
  const sequences: number[][] = [];
  for (const stop of stops) {
    if (stop === '\n' || stop === '\n\n') continue;
    try {
      const res = await fetch(ENCODE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ text: stop }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const data = await res.json().catch(() => null) as { tokens?: unknown; ids?: unknown } | unknown[] | null;
      const raw = Array.isArray(data) ? data : data && typeof data === 'object' ? (data.tokens ?? data.ids) : null;
      if (!Array.isArray(raw)) return [];
      const ids = raw.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id >= 0);
      if (ids.length < 2) continue;
      sequences.push(ids);
    } catch {
      return [];
    }
  }
  return sequences;
}

function appendSeamless(full: string, next: string): string {
  if (!full) return next;
  const window = full.slice(-80);
  const limit = Math.min(window.length, next.length);
  for (let size = limit; size >= 8; size--) {
    if (window.endsWith(next.slice(0, size))) return full + next.slice(size);
  }
  return full + next;
}

function readOutput(raw: string, input: string): string {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return completionOnly(input, raw).replace(/^\s*Character:\s*/i, '');
  }
  const body = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  const direct = firstString(body.output) || firstString(body.text);
  if (direct) return completionOnly(input, direct).replace(/^\s*Character:\s*/i, '');
  const choices = body.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
    const choice = choices[0] as Record<string, unknown>;
    const message = choice.message && typeof choice.message === 'object' ? choice.message as Record<string, unknown> : null;
    const text = firstString(choice.text) || firstString(message?.content);
    if (text) return completionOnly(input, text).replace(/^\s*Character:\s*/i, '');
  }
  return '';
}

function firstString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
