export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSessionAccess } from '@/lib/access';
import { listActiveMessages, markMessageDeleted } from '@/lib/llm/active-messages';
import { resolveChatContext } from '@/lib/llm/resolve';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await requireSessionAccess(id);
    if (access instanceof Response) return access;
    const messages = await listActiveMessages(id);
    return NextResponse.json(messages);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await requireSessionAccess(id);
    if (access instanceof Response) return access;
    const body = await request.json();
    const messageId = body?.messageId;
    const content = body?.content;
    if (!messageId || content === undefined) {
      return NextResponse.json({ error: 'messageId and content required' }, { status: 400 });
    }

    const existing = await prisma.message.findUnique({ where: { id: messageId } });
    if (!existing || existing.sessionId !== id) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    const editHistory = Array.isArray(existing.editHistory) ? existing.editHistory : [];
    editHistory.push({ content: existing.content, editedAt: new Date().toISOString() });

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { content, editHistory },
    });

    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await requireSessionAccess(id);
    if (access instanceof Response) return access;
    const url = new URL(request.url);
    const messageId = url.searchParams.get('messageId');
    if (!messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 });

    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg || msg.sessionId !== id) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    await markMessageDeleted(id, messageId);
    const usage = resolveChatContext(await listActiveMessages(id), 0);
    return NextResponse.json({
      success: true,
      sent_tokens: usage.sent_tokens,
      recent_history_tokens: usage.recent_history_tokens,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}
