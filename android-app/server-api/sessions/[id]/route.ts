export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { normalizeProvider } from '@/lib/types';
import { requireSessionAccess, can } from '@/lib/access';
import { ensureGreeting } from '@/lib/greeting';
import { clampSampling, isProModel } from '@/lib/tiers';
import { listActiveMessages } from '@/lib/llm/active-messages';

function wordList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((word): word is string => typeof word === 'string');
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((word): word is string => typeof word === 'string');
    } catch { /* stored text is not a list */ }
  }
  return [];
}

function packWords(value: unknown): string {
  return JSON.stringify(wordList(value));
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await requireSessionAccess(id);
    if (access instanceof Response) return access;
    const session = await prisma.chatSession.findUnique({
      where: { id },
      include: {
        character: true,
        generationSettings: true,
        meterStates: { orderBy: { messageIndex: 'asc' } },
      },
    });
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    let messages: unknown[] = await listActiveMessages(id);
    if (messages.length === 0) {
      const greeting = await ensureGreeting(session.id, undefined, session.personaId);
      if (greeting) messages = [greeting];
    }
    return NextResponse.json({
      ...session,
      messages,
      generationSettings: session.generationSettings
        ? { ...session.generationSettings, forbiddenWords: wordList(session.generationSettings.forbiddenWords) }
        : null,
    });
  } catch (err: any) {
    console.error('GET /api/sessions/[id] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await requireSessionAccess(id);
    if (access instanceof Response) return access;
    const body = await request.json();
    if (typeof body?.model === 'string' && isProModel(body.model) && !can(access, 'proModels')) {
      return NextResponse.json(
        { error: 'Pro models unlock with Premium.', code: 'UPGRADE_REQUIRED', feature: 'proModels' },
        { status: 402 },
      );
    }
    // Persona quick switcher: null resets to the bound/default persona.
    let personaId: string | null | undefined;
    if (body?.personaId === null) personaId = null;
    else if (typeof body?.personaId === 'string') {
      const owned = await prisma.persona.findFirst({ where: { id: body.personaId, userId: access.user.id }, select: { id: true } });
      if (!owned) return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
      personaId = owned.id;
    }
    const session = await prisma.chatSession.update({
      where: { id },
      data: {
        title: body?.title,
        model: body?.model,
        provider: body?.provider !== undefined ? normalizeProvider(body.provider) : undefined,
        personaId,
      },
    });

    // Update generation settings if provided
    if (body?.generationSettings) {
      // Sampling parameters are Premium+ only; Free/Plus saves keep the defaults.
      if (!can(access, 'advancedGeneration')) {
        body.generationSettings = { ...body.generationSettings, temperature: undefined, topP: undefined, frequencyPenalty: undefined, presencePenalty: undefined };
      } else {
        // Premium/Ultimate ranges: Temperature 0.1–1.5, Top-P 0.1–1.0.
        body.generationSettings = {
          ...body.generationSettings,
          temperature: clampSampling('temperature', body.generationSettings.temperature),
          topP: clampSampling('topP', body.generationSettings.topP),
        };
      }
      await prisma.generationSettings.upsert({
        where: { sessionId: id },
        update: {
          temperature: body.generationSettings.temperature,
          topP: body.generationSettings.topP,
          frequencyPenalty: body.generationSettings.frequencyPenalty,
          presencePenalty: body.generationSettings.presencePenalty,
          maxTokens: body.generationSettings.maxTokens,
          forbiddenWords: packWords(body.generationSettings.forbiddenWords),
        },
        create: {
          sessionId: id,
          temperature: body.generationSettings.temperature ?? 0.8,
          topP: body.generationSettings.topP ?? 0.95,
          frequencyPenalty: body.generationSettings.frequencyPenalty ?? 0,
          presencePenalty: body.generationSettings.presencePenalty ?? 0,
          maxTokens: body.generationSettings.maxTokens ?? 2048,
          forbiddenWords: packWords(body.generationSettings.forbiddenWords),
        },
      });
    }

    return NextResponse.json(session);
  } catch (err: any) {
    console.error('PUT /api/sessions/[id] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await requireSessionAccess(id);
    if (access instanceof Response) return access;
    await prisma.chatSession.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/sessions/[id] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}
