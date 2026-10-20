import 'server-only';
import { prisma } from '@/lib/db';
import { DEFAULT_PROVIDER, DEFAULT_MODEL, normalizeProvider, isGeminiModel, novelApiModel, usableGeminiModel, GEMINI_DEFAULT_MODEL } from '@/lib/types';
import { resolveCustomModel, resolveOpenRouterModel } from '@/lib/llm/messages';
import { recountTurnTokens, type TurnTokens } from '@/lib/context-manager';

export interface ResolvedTarget {
  provider: string;
  model: string;
  config: { apiKey: string | null; baseUrl: string | null; defaultModel: string | null };
}

/**
 * Stop strings for a user turn only. A bare line break is never a stop,
 * so a new paragraph does not end the reply.
 */
export function novelUserStopSequences(userName?: string | null): string[] {
  const name = (userName ?? '').replace(/[\r\n]+/g, ' ').trim();
  const labels = ['[User]'];
  if (name) labels.push(name);
  if (!labels.some((label) => label.toLowerCase() === 'user')) labels.push('User');
  const sequences: string[] = [];
  for (const label of labels) {
    if (!label || label === '\n' || label === '\n\n') continue;
    const sequence = label.startsWith('[') ? `\n${label}` : `\n${label}:`;
    if (sequence === '\n' || sequence === '\n\n') continue;
    sequences.push(sequence);
  }
  return [...new Set(sequences)];
}

function geminiModel(requested?: string | null, configured?: string | null): string {
  if (isGeminiModel(requested)) return usableGeminiModel(requested);
  return usableGeminiModel(configured || GEMINI_DEFAULT_MODEL);
}

/**
 * Resolve which provider/model/key to use for a chat request.
 * When NOVELAI_API_KEY is set, every chat turn uses NovelAI with the requested model id.
 * Returns null if no usable key exists.
 */
export async function resolveChatTarget(provider?: string | null, model?: string | null): Promise<ResolvedTarget | null> {
  const novelKey = process.env.NOVELAI_API_KEY?.trim();
  if (novelKey) {
    const novelModel = novelApiModel(model) || DEFAULT_MODEL;
    return {
      provider: 'NOVELAI',
      model: novelModel,
      config: { apiKey: novelKey, baseUrl: 'https://text.novelai.net/ai/generate', defaultModel: novelModel },
    };
  }

  let p = normalizeProvider(provider);
  let m = model ?? null;

  let config = p === 'NOVELAI' ? null : await prisma.providerConfig.findUnique({ where: { provider: p as any } });
  const selectedReady = !!config?.isActive && !!(config?.apiKey?.trim() || config?.baseUrl?.trim());
  if (p !== DEFAULT_PROVIDER && !selectedReady && p !== 'GEMINI') {
    p = DEFAULT_PROVIDER;
    config = null;
  }

  if (p === 'NOVELAI') {
    return null;
  }

  if (p === 'GEMINI') {
    config = await prisma.providerConfig.findUnique({ where: { provider: 'GEMINI' as any } });
    const geminiReady = !!config?.isActive && !!(config?.apiKey?.trim() || config?.baseUrl?.trim());
    if (!geminiReady) {
      const proxy = await prisma.providerConfig.findFirst({
        where: { provider: { in: ['CUSTOM', 'OPENROUTER'] as any }, isActive: true },
        orderBy: { provider: 'asc' },
      });
      if (proxy && (proxy.apiKey?.trim() || proxy.baseUrl?.trim())) {
        return {
          provider: proxy.provider,
          model: proxy.provider === 'CUSTOM'
            ? resolveCustomModel(m, proxy.defaultModel)
            : resolveOpenRouterModel(m, proxy.defaultModel),
          config: {
            apiKey: proxy.apiKey?.trim() ?? '',
            baseUrl: proxy.baseUrl ?? null,
            defaultModel: proxy.defaultModel ?? null,
          },
        };
      }
      return null;
    }
    m = geminiModel(m, config?.defaultModel);
  } else {
    config = config ?? await prisma.providerConfig.findUnique({ where: { provider: p as any } });
    if (!config?.isActive || !(config.apiKey?.trim() || config.baseUrl?.trim())) return null;
  }

  return {
    provider: p,
    model: p === 'CUSTOM'
      ? resolveCustomModel(m, config?.defaultModel)
      : p === 'OPENROUTER'
        ? resolveOpenRouterModel(m, config?.defaultModel)
        : (m || config?.defaultModel || DEFAULT_MODEL),
    config: {
      apiKey: config?.apiKey?.trim() ?? null,
      baseUrl: config?.baseUrl ?? null,
      defaultModel: config?.defaultModel ?? null,
    },
  };
}

/**
 * Context manager for a turn. Deleted rows are removed before `sent_tokens` and
 * `recent_history_tokens` are calculated, so they never stay in the NovelAI payload.
 */
export function resolveChatContext(
  history: Array<{ role?: string; content?: unknown; deleted?: unknown }>,
  definitionTokens: number,
): TurnTokens & { messages: Array<{ role: string; content: string }> } {
  return recountTurnTokens(history, definitionTokens);
}

/** Provider + model new sessions should start with (NovelAI when the paid key is present). */
export async function getDefaultSessionTarget(): Promise<{ provider: string; model: string }> {
  if (process.env.NOVELAI_API_KEY?.trim()) {
    return { provider: 'NOVELAI', model: DEFAULT_MODEL };
  }
  const paid = await prisma.providerConfig.findFirst({
    where: { provider: { in: ['OPENROUTER', 'CUSTOM', 'ANTHROPIC'] as any }, isActive: true },
    orderBy: { provider: 'asc' },
  });
  if (paid && (paid.apiKey?.trim() || paid.baseUrl?.trim())) {
    const model = paid.provider === 'CUSTOM'
      ? resolveCustomModel(null, paid.defaultModel)
      : paid.provider === 'OPENROUTER'
        ? resolveOpenRouterModel(null, paid.defaultModel)
        : (paid.defaultModel || DEFAULT_MODEL);
    return { provider: paid.provider, model };
  }
  const gemini = await prisma.providerConfig.findUnique({ where: { provider: 'GEMINI' as any } });
  if (gemini?.isActive && (gemini.apiKey?.trim() || gemini.baseUrl?.trim())) {
    return { provider: 'GEMINI', model: geminiModel(null, gemini.defaultModel) };
  }
  return { provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL };
}
