import 'server-only';
import { prisma } from '@/lib/db';

const DIMS = 1536;

export async function embedText(text: string, hint?: { provider?: string; apiKey?: string | null; baseUrl?: string | null }): Promise<number[] | null> {
  const input = text.replace(/\s+/g, ' ').trim().slice(0, 8000);
  if (!input) return null;

  const openaiKey = (process.env.OPENAI_API_KEY || process.env.EMBEDDING_API_KEY || '').trim();
  if (openaiKey) {
    const vector = await openAIEmbed(input, openaiKey, process.env.EMBEDDING_BASE_URL);
    if (vector) return vector;
  }

  const gemini = await geminiCredentials(hint);
  if (!gemini) return null;
  return geminiEmbed(input, gemini.apiKey, gemini.baseUrl);
}

async function geminiCredentials(hint?: { provider?: string; apiKey?: string | null; baseUrl?: string | null }): Promise<{ apiKey: string; baseUrl: string | null } | null> {
  if ((hint?.provider ?? '').toUpperCase() === 'GEMINI' && hint?.apiKey?.trim()) {
    return { apiKey: hint.apiKey.trim(), baseUrl: hint.baseUrl ?? null };
  }
  const saved = await prisma.providerConfig.findUnique({ where: { provider: 'GEMINI' } }).catch(() => null);
  const apiKey = saved?.apiKey?.trim();
  if (!apiKey || saved?.isActive === false) return null;
  return { apiKey, baseUrl: saved.baseUrl };
}

async function openAIEmbed(input: string, apiKey: string, baseUrl?: string): Promise<number[] | null> {
  const root = (baseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const res = await fetch(`${root}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input, dimensions: DIMS }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  return asVector(json?.data?.[0]?.embedding);
}

async function geminiEmbed(input: string, apiKey: string, baseUrl?: string | null): Promise<number[] | null> {
  const root = (baseUrl?.trim() || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '').replace(/\/v1beta$/i, '');
  const res = await fetch(`${root}/v1beta/models/gemini-embedding-001:embedContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      content: { parts: [{ text: input }] },
      outputDimensionality: DIMS,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  return asVector(json?.embedding?.values);
}

function asVector(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== DIMS) return null;
  const vector = value.map((item) => Number(item));
  return vector.every((item) => Number.isFinite(item)) ? vector : null;
}
