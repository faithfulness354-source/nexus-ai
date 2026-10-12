export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { GROQ_CHAT_MODELS, PROVIDER_MODELS } from '@/lib/types';

const NON_CHAT_MODEL = /whisper|orpheus|prompt-guard|safeguard|tts|playai/i;

/** Live Groq chat ids when a key is saved. Otherwise the documented current list. */
async function groqChatModels(): Promise<string[]> {
  const config = await prisma.providerConfig.findUnique({
    where: { provider: 'CUSTOM' },
    select: { apiKey: true, baseUrl: true, isActive: true },
  });
  const key = config?.apiKey?.trim() ?? '';
  const baseUrl = config?.baseUrl?.trim() ?? '';
  if (!config?.isActive || !key || (baseUrl && !/groq\.com/i.test(baseUrl))) return GROQ_CHAT_MODELS;
  const root = (baseUrl || process.env.GROQ_BASE_URL?.trim() || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
  try {
    const res = await fetch(`${root}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return GROQ_CHAT_MODELS;
    const body = await res.json().catch(() => null);
    const ids = Array.isArray(body?.data)
      ? body.data
          .filter((row: { id?: string; active?: boolean }) => row?.active !== false && typeof row?.id === 'string')
          .map((row: { id: string }) => row.id.trim())
          .filter((id: string) => id && !NON_CHAT_MODEL.test(id))
      : [];
    return ids.length ? ids : GROQ_CHAT_MODELS;
  } catch {
    return GROQ_CHAT_MODELS;
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params;
    const name = provider?.toUpperCase() ?? '';
    const models = name === 'CUSTOM' ? await groqChatModels() : (PROVIDER_MODELS?.[name] ?? []);
    return NextResponse.json({ models });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}
