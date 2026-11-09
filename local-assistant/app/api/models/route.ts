import { NextRequest } from 'next/server';
import { fetchLocal, trimSlash } from '@/lib/local-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lists installed model tags from Ollama or an OpenAI-compatible local server. */
export async function GET(request: NextRequest) {
  const backend = request.nextUrl.searchParams.get('backend') === 'openai-compat' ? 'openai-compat' : 'ollama';
  const ollamaBase = trimSlash(request.nextUrl.searchParams.get('ollamaBaseUrl') || 'http://localhost:11434');
  const openaiBase = trimSlash(request.nextUrl.searchParams.get('openaiCompatBaseUrl') || 'http://localhost:1234/v1');

  try {
    if (backend === 'openai-compat') {
      const res = await fetchLocal(`${openaiBase}/models`, { method: 'GET' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return Response.json({ error: `Models ${res.status}: ${text || res.statusText}`, models: [] }, { status: 502 });
      }
      const data = await res.json();
      const models = Array.isArray(data?.data)
        ? data.data.map((row: { id?: string }) => row.id).filter((id: unknown): id is string => typeof id === 'string' && !!id.trim())
        : [];
      return Response.json({ models });
    }

    const res = await fetchLocal(`${ollamaBase}/api/tags`, { method: 'GET' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return Response.json({ error: `Ollama tags ${res.status}: ${text || res.statusText}`, models: [] }, { status: 502 });
    }
    const data = await res.json();
    const models = Array.isArray(data?.models)
      ? data.models.map((row: { name?: string; model?: string }) => row.name || row.model).filter((id: unknown): id is string => typeof id === 'string' && !!id.trim())
      : [];
    return Response.json({ models });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list models';
    return Response.json({ error: message, models: [] }, { status: 502 });
  }
}
