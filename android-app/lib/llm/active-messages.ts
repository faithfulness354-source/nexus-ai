import 'server-only';
import { prisma } from '@/lib/db';
import { messageContent } from '@/lib/llm/messages';

export interface StoredMessage {
  id: string;
  sessionId: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  model: string | null;
  tokenCount: number;
  editHistory: unknown;
  createdAt: Date;
  index: number;
  deleted: false;
}

function warnSkipped(scope: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`[chat] ${scope} skipped:`, message);
}

function asRole(value: string): StoredMessage['role'] | null {
  const role = value.toUpperCase();
  if (role === 'USER' || role === 'ASSISTANT' || role === 'SYSTEM') return role;
  return null;
}

/** Active turns only. Soft-deleted rows never enter the chat payload or the token window. */
export async function listActiveMessages(sessionId: string): Promise<StoredMessage[]> {
  try {
    const rows = await prisma.message.findMany({
      where: { sessionId, deleted: false },
      orderBy: { index: 'asc' },
    });
    const messages: StoredMessage[] = [];
    for (const row of rows) {
      const role = asRole(String(row.role ?? ''));
      const content = messageContent(row.content);
      if (!role || !content.trim()) continue;
      messages.push({
        id: row.id,
        sessionId: row.sessionId,
        role,
        content,
        model: row.model ?? null,
        tokenCount: row.tokenCount ?? 0,
        editHistory: row.editHistory ?? [],
        createdAt: row.createdAt,
        index: row.index,
        deleted: false,
      });
    }
    return messages;
  } catch (err) {
    warnSkipped('history lookup', err);
    return [];
  }
}

/** Next index across every row, including soft-deleted ones, so a new turn does not reuse an old slot. */
export async function nextMessageIndex(sessionId: string): Promise<number> {
  try {
    const highest = await prisma.message.aggregate({
      where: { sessionId },
      _max: { index: true },
    });
    return (highest._max.index ?? -1) + 1;
  } catch (err) {
    warnSkipped('message index', err);
    return 0;
  }
}

export async function markMessageDeleted(sessionId: string, messageId: string): Promise<void> {
  try {
    await prisma.message.updateMany({
      where: { id: messageId, sessionId },
      data: { deleted: true },
    });
  } catch (err) {
    warnSkipped('soft delete', err);
  }
}
