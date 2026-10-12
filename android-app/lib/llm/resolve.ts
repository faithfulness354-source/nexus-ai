import { prisma } from '@/lib/db';
import { DEFAULT_PROVIDER, DEFAULT_MODEL, normalizeProvider, isGeminiModel, usableGeminiModel } from '@/lib/types';
import { resolveCustomModel, resolveOpenRouterModel } from '@/lib/llm/messages';

export interface ResolvedTarget {
  provider: string;
  model: string;
  config: { apiKey: string | null; baseUrl: string | null; defaultModel: string | null };
}

function geminiModel(requested?: string | null, configured?: string | null): string {
  if (isGeminiModel(requested)) return usableGeminiModel(requested);
  return usableGeminiModel(configured);
}

/**
 * Resolve which provider/model/key to use for a chat request.
 * - Unsupported providers (e.g. legacy OpenAI sessions) are mapped to Google Gemini.
 * - If the selected provider has no saved key, the saved Gemini key is used instead.
 * Returns null if no usable key exists.
 */
export async function resolveChatTarget(provider?: string | null, model?: string | null): Promise<ResolvedTarget | null> {
  let p = normalizeProvider(provider);
  let m = model ?? null;

  let config = p === DEFAULT_PROVIDER ? null : await prisma.providerConfig.findUnique({ where: { provider: p as any } });
  const selectedReady = !!config?.isActive && !!(config?.apiKey?.trim() || config?.baseUrl?.trim());
  if (p !== DEFAULT_PROVIDER && !selectedReady) {
    p = DEFAULT_PROVIDER;
    config = null;
  }

  if (p === DEFAULT_PROVIDER) {
    config = await prisma.providerConfig.findUnique({ where: { provider: DEFAULT_PROVIDER as any } });
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
    m = geminiModel(m, config.defaultModel);
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

/** Provider + model new sessions should start with (always Google Gemini). */
export async function getDefaultSessionTarget(): Promise<{ provider: string; model: string }> {
  const gemini = await prisma.providerConfig.findUnique({ where: { provider: DEFAULT_PROVIDER as any } });
  return { provider: DEFAULT_PROVIDER, model: geminiModel(null, gemini?.defaultModel) };
}
