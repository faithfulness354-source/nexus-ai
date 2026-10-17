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

interface MessageRow {
  id: string;
  sessionId: string;
  role: string;
  content: unknown;
  model: string | null;
  tokenCount: number | bigint | null;
  editHistory: unknown;
  createdAt: Date | string | number;
  index: number | bigint;
}

let columnReady: Promise<void> | null = null;

/** Adds the soft-delete flag on the public chat table when an older database is missing it. */
export function ensureDeletedColumn(): Promise<void> {
  if (!columnReady) {
    columnReady = (async () => {
      try {
        await prisma.$executeRawUnsafe(
          'ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT false',
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[chat] chat_messages.deleted check skipped:', message);
      }
    })();
  }
  return columnReady;
}

function asDate(value: Date | string | number): Date {
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function asHistory(value: unknown): unknown {
  if (typeof value !== 'string') return Array.isArray(value) ? value : [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function asRole(value: string): StoredMessage['role'] | null {
  const role = value.toUpperCase();
  if (role === 'USER' || role === 'ASSISTANT' || role === 'SYSTEM') return role;
  return null;
}

/** Active turns only. Soft-deleted rows never enter the chat payload or the token window. */
export async function listActiveMessages(sessionId: string): Promise<StoredMessage[]> {
  await ensureDeletedColumn();
  const rows = await prisma.$queryRaw<MessageRow[]>`
    SELECT id, "sessionId", role, content, model, "tokenCount", "editHistory", "createdAt", "index"
    FROM nexus."Message"
    WHERE "sessionId" = ${sessionId} AND deleted = false
    ORDER BY "index" ASC
  `;
  const messages: StoredMessage[] = [];
  for (const row of rows) {
    const role = asRole(String(row.role ?? ''));
    const content = messageContent(row.content).trim();
    if (!role || !content) continue;
    messages.push({
      id: String(row.id),
      sessionId: String(row.sessionId),
      role,
      content,
      model: row.model ?? null,
      tokenCount: Number(row.tokenCount ?? 0),
      editHistory: asHistory(row.editHistory),
      createdAt: asDate(row.createdAt),
      index: Number(row.index),
      deleted: false,
    });
  }
  return messages;
}

/** Next index across every row, including soft-deleted ones, so a new turn does not reuse an old slot. */
export async function nextMessageIndex(sessionId: string): Promise<number> {
  await ensureDeletedColumn();
  const rows = await prisma.$queryRaw<Array<{ next: number | bigint | null }>>`
    SELECT COALESCE(MAX("index"), -1) + 1 AS next FROM nexus."Message" WHERE "sessionId" = ${sessionId}
  `;
  return Number(rows[0]?.next ?? 0);
}

export async function markMessageDeleted(sessionId: string, messageId: string): Promise<void> {
  await ensureDeletedColumn();
  await prisma.$executeRaw`UPDATE nexus."Message" SET deleted = true WHERE id = ${messageId} AND "sessionId" = ${sessionId}`;
}
