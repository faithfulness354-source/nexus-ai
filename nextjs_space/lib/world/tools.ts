import 'server-only';
import { isOpenAIProxy } from '@/lib/llm/messages';
import { normalizeProvider } from '@/lib/types';
import type { WorldStateRow, WorldToolCall } from './types';

const TOOL_SYSTEM = [
  'You record persistent world changes after a roleplay turn.',
  'Call update_world_state only when trust, inventory, house, alignment, or an achievement actually changed.',
  'Call add_memory only for a lasting fact or story beat that should be recalled in a later scene.',
  'If nothing lasting changed, call no tools.',
].join(' ');

const UPDATE_PARAMETERS = {
  type: 'object',
  properties: {
    trust: { type: 'number', description: 'New trust score from -100 to 100.' },
    inventory: { type: 'array', items: { type: 'string' }, description: 'Full inventory after this turn.' },
    house: { type: 'string', description: 'Faction, household, or allegiance.' },
    alignment: { type: 'string', description: 'Moral or narrative alignment.' },
    unlock_achievements: { type: 'array', items: { type: 'string' }, description: 'Newly unlocked achievement names.' },
  },
};

const MEMORY_PARAMETERS = {
  type: 'object',
  properties: {
    content: { type: 'string', description: 'One lasting fact or narrative beat, in a single sentence.' },
  },
  required: ['content'],
};

export async function requestWorldToolCalls(opts: {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string | null;
  userText: string;
  assistantText: string;
  state: WorldStateRow;
}): Promise<WorldToolCall[]> {
  const apiKey = opts.apiKey.trim();
  if (!apiKey || normalizeProvider(opts.provider) === 'NOVELAI') return [];
  const prompt = [
    `Current trust: ${opts.state.stats.trust}`,
    `Current inventory: ${opts.state.stats.inventory.join(', ') || 'empty'}`,
    `Current house: ${opts.state.stats.house || 'unset'}`,
    `Current alignment: ${opts.state.stats.alignment || 'unset'}`,
    `Unlocked achievements: ${opts.state.unlockedAchievements.join(', ') || 'none'}`,
    `User: ${clip(opts.userText)}`,
    `Assistant: ${clip(opts.assistantText)}`,
  ].join('\n');

  const provider = normalizeProvider(opts.provider);
  if (provider === 'GEMINI' && !isOpenAIProxy(opts.baseUrl)) return geminiTools(opts, prompt);
  if (provider === 'ANTHROPIC') return anthropicTools(opts, prompt);
  return openAITools(opts, prompt);
}

async function openAITools(opts: { model: string; apiKey: string; baseUrl?: string | null }, prompt: string): Promise<WorldToolCall[]> {
  const root = (opts.baseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
  const res = await fetch(`${root}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey.trim()}` },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0,
      max_tokens: 400,
      messages: [
        { role: 'system', content: TOOL_SYSTEM },
        { role: 'user', content: prompt },
      ],
      tools: [
        { type: 'function', function: { name: 'update_world_state', description: 'Merge changed stats or unlock achievements.', parameters: UPDATE_PARAMETERS } },
        { type: 'function', function: { name: 'add_memory', description: 'Store one lasting narrative beat.', parameters: MEMORY_PARAMETERS } },
      ],
      tool_choice: 'auto',
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  const calls = json?.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(calls)) return [];
  return calls.flatMap((call: { function?: { name?: string; arguments?: string } }) => {
    const name = call?.function?.name;
    if (name !== 'update_world_state' && name !== 'add_memory') return [];
    return [{ name, args: parseArgs(call.function?.arguments) }];
  });
}

async function anthropicTools(opts: { model: string; apiKey: string; baseUrl?: string | null }, prompt: string): Promise<WorldToolCall[]> {
  const root = (opts.baseUrl?.trim() || 'https://api.anthropic.com').replace(/\/+$/, '');
  const res = await fetch(`${root}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.apiKey.trim(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 400,
      temperature: 0,
      system: TOOL_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      tools: [
        { name: 'update_world_state', description: 'Merge changed stats or unlock achievements.', input_schema: UPDATE_PARAMETERS },
        { name: 'add_memory', description: 'Store one lasting narrative beat.', input_schema: MEMORY_PARAMETERS },
      ],
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  const blocks = json?.content;
  if (!Array.isArray(blocks)) return [];
  return blocks.flatMap((block: { type?: string; name?: string; input?: unknown }) => {
    if (block?.type !== 'tool_use') return [];
    if (block.name !== 'update_world_state' && block.name !== 'add_memory') return [];
    const args = block.input && typeof block.input === 'object' ? block.input as Record<string, unknown> : {};
    return [{ name: block.name, args }];
  });
}

async function geminiTools(opts: { model: string; apiKey: string; baseUrl?: string | null }, prompt: string): Promise<WorldToolCall[]> {
  const root = (opts.baseUrl?.trim() || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '').replace(/\/v1beta$/i, '');
  const res = await fetch(`${root}/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey.trim() },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: TOOL_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 400 },
      tools: [{
        functionDeclarations: [
          { name: 'update_world_state', description: 'Merge changed stats or unlock achievements.', parameters: geminiSchema(UPDATE_PARAMETERS) },
          { name: 'add_memory', description: 'Store one lasting narrative beat.', parameters: geminiSchema(MEMORY_PARAMETERS) },
        ],
      }],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return [];
  return parts.flatMap((part: { functionCall?: { name?: string; args?: unknown } }) => {
    const name = part?.functionCall?.name;
    if (name !== 'update_world_state' && name !== 'add_memory') return [];
    const args = part.functionCall?.args && typeof part.functionCall.args === 'object'
      ? part.functionCall.args as Record<string, unknown>
      : {};
    return [{ name, args }];
  });
}

function geminiSchema(schema: { type: string; properties: Record<string, unknown>; required?: string[] }) {
  return {
    type: 'OBJECT',
    properties: Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => {
      const field = value as { type?: string; items?: { type?: string }; description?: string };
      if (field.type === 'array') {
        return [key, { type: 'ARRAY', items: { type: 'STRING' }, description: field.description }];
      }
      return [key, { type: (field.type ?? 'string').toUpperCase(), description: field.description }];
    })),
    ...(schema.required?.length ? { required: schema.required } : {}),
  };
}

function parseArgs(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function clip(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 2500);
}
