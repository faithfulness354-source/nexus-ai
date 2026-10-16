export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSessionAccess } from '@/lib/access';
import { listActiveMessages } from '@/lib/llm/active-messages';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const viewer = await requireSessionAccess(id);
    if (viewer instanceof Response) return viewer;
    const body = await request.json();
    const messageIndex = body?.messageIndex ?? 0;

    const originalSession = await prisma.chatSession.findUnique({
      where: { id },
      include: {
        generationSettings: true,
      },
    });
    if (!originalSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    // Create branched session
    const newSession = await prisma.chatSession.create({
      data: {
        characterId: originalSession.characterId,
        userId: viewer.user.id,
        title: `Branch from: ${originalSession?.title ?? 'Chat'}`,
        model: originalSession.model,
        provider: originalSession.provider,
        branchedFromSessionId: id,
        branchedAtMessageIndex: messageIndex,
      },
    });

    // Copy active messages up to the branch point. Soft-deleted turns stay behind.
    const activeMessages = (await listActiveMessages(id)).filter((msg) => msg.index <= messageIndex);
    for (const msg of activeMessages) {
      await prisma.message.create({
        data: {
          sessionId: newSession.id,
          role: msg.role,
          content: msg.content,
          model: msg.model,
          tokenCount: msg.tokenCount,
          index: msg.index,
        },
      });
    }

    // Copy generation settings
    if (originalSession?.generationSettings) {
      await prisma.generationSettings.create({
        data: {
          sessionId: newSession.id,
          temperature: originalSession.generationSettings.temperature,
          topP: originalSession.generationSettings.topP,
          frequencyPenalty: originalSession.generationSettings.frequencyPenalty,
          presencePenalty: originalSession.generationSettings.presencePenalty,
          maxTokens: originalSession.generationSettings.maxTokens,
          forbiddenWords: originalSession.generationSettings.forbiddenWords,
        },
      });
    }

    return NextResponse.json(newSession, { status: 201 });
  } catch (err: any) {
    console.error('Branch error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to branch' }, { status: 500 });
  }
}
