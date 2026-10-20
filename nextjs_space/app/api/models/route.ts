export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_MODELS } from '@/lib/types';
import { listProviderModels } from '@/lib/llm/provider-models';

/**
 * Active paid chat catalog for the model dropdown.
 * When NOVELAI_API_KEY is set (production), NovelAI is the only source.
 * Otherwise the first active saved provider with a key wins.
 */
export async function GET() {
  try {
    if (process.env.NOVELAI_API_KEY?.trim()) {
      const models = await listProviderModels('NOVELAI');
      return NextResponse.json({
        provider: 'NOVELAI',
        models: models.length ? models : (PROVIDER_MODELS.NOVELAI ?? [DEFAULT_MODEL]),
      });
    }

    const preferred = [DEFAULT_PROVIDER, 'OPENROUTER', 'CUSTOM', 'ANTHROPIC', 'GEMINI'] as const;
    for (const provider of preferred) {
      if (provider === 'GEMINI') continue;
      const config = await prisma.providerConfig.findUnique({
        where: { provider: provider as any },
        select: { isActive: true, apiKey: true, baseUrl: true },
      });
      if (!config?.isActive || !(config.apiKey?.trim() || config.baseUrl?.trim())) continue;
      const models = await listProviderModels(provider);
      if (models.length) return NextResponse.json({ provider, models });
    }

    const models = await listProviderModels(DEFAULT_PROVIDER);
    return NextResponse.json({
      provider: DEFAULT_PROVIDER,
      models: models.length ? models : (PROVIDER_MODELS[DEFAULT_PROVIDER] ?? [DEFAULT_MODEL]),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
