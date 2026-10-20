export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { listProviderModels } from '@/lib/llm/provider-models';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params;
    const models = await listProviderModels(provider?.toUpperCase() ?? '');
    return NextResponse.json({ models });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
