import 'server-only';
import { prisma } from '@/lib/db';
import { GROQ_CHAT_MODELS, OPENROUTER_CHAT_MODELS, PROVIDER_MODELS, isGeminiFamilyModel } from '@/lib/types';

const NON_CHAT_MODEL = /whisper|orpheus|prompt-guard|safeguard|tts|playai|embed|moderation|image|vision/i;

function cleanIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || isGeminiFamilyModel(id) || NON_CHAT_MODEL.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

async function openRouterModels(): Promise<string[]> {
  const config = await prisma.providerConfig.findUnique({
    where: { provider: 'OPENROUTER' },
    select: { apiKey: true, isActive: true },
  });
  const key = config?.apiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim() || '';
  if (!key) return cleanIds(OPENROUTER_CHAT_MODELS);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return cleanIds(OPENROUTER_CHAT_MODELS);
    const body = await res.json().catch(() => null);
    const ids = Array.isArray(body?.data)
      ? body.data
          .filter((row: { id?: string; architecture?: { output_modalities?: string[] } }) => {
            if (typeof row?.id !== 'string') return false;
            const modalities = row.architecture?.output_modalities;
            return !Array.isArray(modalities) || modalities.includes('text');
          })
          .map((row: { id: string }) => row.id.trim())
      : [];
    const cleaned = cleanIds(ids);
    return cleaned.length ? cleaned : cleanIds(OPENROUTER_CHAT_MODELS);
  } catch {
    return cleanIds(OPENROUTER_CHAT_MODELS);
  }
}

async function groqChatModels(): Promise<string[]> {
  const config = await prisma.providerConfig.findUnique({
    where: { provider: 'CUSTOM' },
    select: { apiKey: true, baseUrl: true, isActive: true },
  });
  const key = config?.apiKey?.trim() ?? '';
  const baseUrl = config?.baseUrl?.trim() ?? '';
  if (!config?.isActive || !key || (baseUrl && !/groq\.com/i.test(baseUrl))) return cleanIds(GROQ_CHAT_MODELS);
  const root = (baseUrl || process.env.GROQ_BASE_URL?.trim() || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
  try {
    const res = await fetch(`${root}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return cleanIds(GROQ_CHAT_MODELS);
    const body = await res.json().catch(() => null);
    const ids = Array.isArray(body?.data)
      ? body.data
          .filter((row: { id?: string; active?: boolean }) => row?.active !== false && typeof row?.id === 'string')
          .map((row: { id: string }) => row.id.trim())
      : [];
    const cleaned = cleanIds(ids);
    return cleaned.length ? cleaned : cleanIds(GROQ_CHAT_MODELS);
  } catch {
    return cleanIds(GROQ_CHAT_MODELS);
  }
}

/** Live or documented chat model ids for one provider. Gemini family ids are filtered out of paid catalogs. */
export async function listProviderModels(provider: string): Promise<string[]> {
  const name = provider.toUpperCase();
  if (name === 'CUSTOM') return groqChatModels();
  if (name === 'OPENROUTER') return openRouterModels();
  if (name === 'NOVELAI') return cleanIds(PROVIDER_MODELS.NOVELAI ?? []);
  if (name === 'GEMINI') return PROVIDER_MODELS.GEMINI ?? [];
  return cleanIds(PROVIDER_MODELS[name] ?? []);
}
