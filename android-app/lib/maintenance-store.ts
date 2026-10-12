import 'server-only';

import { prisma } from '@/lib/db';

export type StoredLog = {
  id: string;
  severity: string;
  source: string;
  message: string;
  route: string;
  sessionId: string;
  durationMs: number | null;
  createdAt: Date;
};

type RawLog = {
  id: string;
  severity: string;
  source: string;
  message: string;
  route: string;
  sessionId: string;
  durationMs: number | null;
  createdAt: string | Date;
};

function createId(): string {
  if (process.env.NEXT_RUNTIME === 'edge' || typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('Maintenance logs are only written from the Node.js server.');
  }
  return globalThis.crypto.randomUUID();
}

function asDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function mapRow(row: RawLog): StoredLog {
  return { ...row, createdAt: asDate(row.createdAt) };
}

/** Inserts a maintenance row without relying on a regenerated Prisma delegate. */
export async function insertMaintenanceLog(entry: {
  severity: string;
  source: string;
  message: string;
  route: string;
  userId: string;
  sessionId: string;
  stack: string;
  meta: string;
  durationMs: number | null;
}): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "MaintenanceLog" ("id", "severity", "source", "message", "route", "userId", "sessionId", "stack", "meta", "durationMs", "createdAt")
    VALUES (
      ${createId()},
      ${entry.severity},
      ${entry.source},
      ${entry.message},
      ${entry.route},
      ${entry.userId},
      ${entry.sessionId},
      ${entry.stack},
      ${entry.meta},
      ${entry.durationMs},
      ${new Date()}
    )
  `;
}

export async function recentMaintenanceLogs(limit: number): Promise<StoredLog[]> {
  const rows = limit > 100
    ? await prisma.$queryRaw<RawLog[]>`
        SELECT "id", "severity", "source", "message", "route", "sessionId", "durationMs", "createdAt"
        FROM "MaintenanceLog"
        ORDER BY "createdAt" DESC
        LIMIT 1000
      `
    : await prisma.$queryRaw<RawLog[]>`
        SELECT "id", "severity", "source", "message", "route", "sessionId", "durationMs", "createdAt"
        FROM "MaintenanceLog"
        ORDER BY "createdAt" DESC
        LIMIT 40
      `;
  return rows.map(mapRow);
}

export async function maintenanceLogsSince(since: Date): Promise<StoredLog[]> {
  const rows = await prisma.$queryRaw<RawLog[]>`
    SELECT "id", "severity", "source", "message", "route", "sessionId", "durationMs", "createdAt"
    FROM "MaintenanceLog"
    WHERE "createdAt" >= ${since}
    ORDER BY "createdAt" DESC
    LIMIT 1000
  `;
  return rows.map(mapRow);
}
