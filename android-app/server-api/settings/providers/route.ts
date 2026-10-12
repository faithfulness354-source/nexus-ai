export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SUPPORTED_PROVIDERS, usableModelForProvider } from '@/lib/types';
import { requireCreatorAdmin } from '@/lib/access';

const PROVIDER_SELECT = {
  provider: true,
  apiKey: true,
  baseUrl: true,
  defaultModel: true,
  isActive: true,
} as const;

type ProviderRow = {
  provider: string;
  apiKey: string | null;
  baseUrl: string | null;
  defaultModel: string | null;
  isActive: boolean;
};

/** Last four characters only. The stored key never leaves the server. */
function presentProvider(row: ProviderRow) {
  const key = row.apiKey?.trim() ?? '';
  return {
    provider: row.provider,
    baseUrl: row.baseUrl ?? '',
    defaultModel: usableModelForProvider(row.provider, row.defaultModel),
    isActive: row.isActive,
    apiKey: key ? `••••${key.slice(-4)}` : null,
  };
}

function supportedProvider(value: unknown): string | null {
  const provider = String(value ?? '').trim();
  if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(provider)) return null;
  return provider;
}

async function saveProvider(request: NextRequest) {
  const viewer = await requireCreatorAdmin();
  if (viewer instanceof Response) return viewer;
  const body = await request.json().catch(() => null);
  const provider = supportedProvider(body?.provider);
  if (!provider) return NextResponse.json({ error: 'Unsupported provider.' }, { status: 400 });

  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
  const hasModel = body?.defaultModel !== undefined;
  const defaultModel = hasModel ? (usableModelForProvider(provider, body?.defaultModel) || null) : undefined;
  const isActive = typeof body?.isActive === 'boolean' ? body.isActive : undefined;

  const config = await prisma.providerConfig.upsert({
    where: { provider: provider as any },
    update: {
      ...(apiKey ? { apiKey } : {}),
      ...(body?.baseUrl !== undefined ? { baseUrl: body.baseUrl } : {}),
      ...(defaultModel !== undefined ? { defaultModel } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
    create: {
      provider: provider as any,
      apiKey: apiKey || null,
      baseUrl: body?.baseUrl ?? null,
      defaultModel: defaultModel ?? null,
      isActive: isActive ?? true,
    },
    select: PROVIDER_SELECT,
  });

  return NextResponse.json(presentProvider(config));
}

export async function GET() {
  try {
    const viewer = await requireCreatorAdmin();
    if (viewer instanceof Response) return viewer;
    const providers = await prisma.providerConfig.findMany({
      where: { provider: { in: [...SUPPORTED_PROVIDERS] as any } },
      orderBy: { provider: 'asc' },
      select: PROVIDER_SELECT,
    });
    return NextResponse.json(providers.map(presentProvider));
  } catch (err) {
    console.error('GET /api/settings/providers error:', err);
    return NextResponse.json({ error: 'Failed to load API settings.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    return await saveProvider(request);
  } catch (err) {
    console.error('POST /api/settings/providers error:', err);
    return NextResponse.json({ error: 'Failed to save API settings.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    return await saveProvider(request);
  } catch (err) {
    console.error('PUT /api/settings/providers error:', err);
    return NextResponse.json({ error: 'Failed to save API settings.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    return await saveProvider(request);
  } catch (err) {
    console.error('PATCH /api/settings/providers error:', err);
    return NextResponse.json({ error: 'Failed to save API settings.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const viewer = await requireCreatorAdmin();
    if (viewer instanceof Response) return viewer;
    const provider = supportedProvider(new URL(request.url).searchParams.get('provider'));
    if (!provider) return NextResponse.json({ error: 'Unsupported provider.' }, { status: 400 });
    const existing = await prisma.providerConfig.findUnique({ where: { provider: provider as any }, select: { provider: true } });
    if (!existing) return NextResponse.json({ error: 'Provider not found.' }, { status: 404 });
    const config = await prisma.providerConfig.update({
      where: { provider: provider as any },
      data: { apiKey: null, isActive: false },
      select: PROVIDER_SELECT,
    });
    return NextResponse.json(presentProvider(config));
  } catch (err) {
    console.error('DELETE /api/settings/providers error:', err);
    return NextResponse.json({ error: 'Failed to remove API settings.' }, { status: 500 });
  }
}
