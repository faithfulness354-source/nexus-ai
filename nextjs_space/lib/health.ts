import { access } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/db';
import { resolveChatTarget } from '@/lib/llm/resolve';

export type CheckResult = {
  ok: boolean;
  detail: string;
  ms?: number;
};

export type HealthReport = {
  status: 'ok' | 'degraded' | 'down';
  time: string;
  checks: {
    database: CheckResult;
    llm: CheckResult;
    media: CheckResult & { missing?: number };
    sessions: CheckResult & { broken?: number; checked?: number };
  };
};

const PUBLIC_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public');

function localFile(url: string): string | null {
  const clean = url.split('?')[0]?.trim() ?? '';
  if (!clean.startsWith('/') || clean.includes('..')) return null;
  return path.join(/*turbopackIgnore: true*/ PUBLIC_DIR, clean);
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(/*turbopackIgnore: true*/ file);
    return true;
  } catch {
    return false;
  }
}

async function checkDatabase(): Promise<CheckResult> {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, detail: 'Database responded.', ms: Date.now() - started };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'Database ping failed.', ms: Date.now() - started };
  }
}

async function checkLlm(): Promise<CheckResult> {
  const started = Date.now();
  try {
    const target = await resolveChatTarget();
    if (!target?.config.apiKey) {
      const turnedOff = await prisma.providerConfig.findFirst({
        where: { isActive: false, apiKey: { not: null } },
        select: { provider: true },
      });
      return { ok: false, detail: turnedOff ? 'A saved API key is turned off.' : 'No model key is saved.', ms: Date.now() - started };
    }
    const host = target.config.baseUrl?.trim() || 'https://generativelanguage.googleapis.com/';
    const response = await fetch(host, { method: 'GET', signal: AbortSignal.timeout(4000) });
    const reachable = response.status < 500;
    return {
      ok: reachable,
      detail: reachable ? `Model host responded (${response.status}).` : `Model host returned ${response.status}.`,
      ms: Date.now() - started,
    };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'Model host is unreachable.', ms: Date.now() - started };
  }
}

export async function missingLocalAssets(limit = 40): Promise<{ name: string; path: string }[]> {
  const cards = await prisma.character.findMany({
    select: { name: true, avatar: true, audioUrl: true, gallery: true },
  });
  const missing: { name: string; path: string }[] = [];
  for (const card of cards) {
    const urls = [card.avatar, card.audioUrl];
    const gallery = Array.isArray(card.gallery) ? card.gallery : [];
    for (const item of gallery) {
      if (item && typeof item === 'object' && 'url' in item && typeof item.url === 'string') urls.push(item.url);
    }
    for (const url of urls) {
      if (!url) continue;
      const file = localFile(url);
      if (!file || await exists(file)) continue;
      missing.push({ name: card.name, path: url });
      if (missing.length >= limit) return missing;
    }
  }
  return missing;
}

async function checkMedia(): Promise<HealthReport['checks']['media']> {
  const started = Date.now();
  if (!(await exists(PUBLIC_DIR))) {
    return { ok: false, detail: 'Public asset directory is missing.', ms: Date.now() - started, missing: 0 };
  }
  try {
    const missing = await missingLocalAssets(20);
    return {
      ok: missing.length === 0,
      detail: missing.length === 0 ? 'Public assets are readable.' : `${missing.length} local asset references are missing.`,
      ms: Date.now() - started,
      missing: missing.length,
    };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'Asset check failed.', ms: Date.now() - started };
  }
}

async function checkSessions(): Promise<HealthReport['checks']['sessions']> {
  const started = Date.now();
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const active = await prisma.chatSession.findMany({
      where: { updatedAt: { gte: since } },
      select: { id: true },
      take: 300,
    });
    if (active.length === 0) {
      return { ok: true, detail: 'No chats were updated in the last 7 days.', ms: Date.now() - started, broken: 0, checked: 0 };
    }
    const groups = await prisma.message.groupBy({
      by: ['sessionId'],
      where: { sessionId: { in: active.map((session) => session.id) } },
      _count: { _all: true },
      _max: { index: true },
    });
    const broken = groups.filter((group) => (group._max.index ?? -1) + 1 !== group._count._all).length;
    return {
      ok: broken === 0,
      detail: broken === 0 ? 'Recent chat indexes are continuous.' : `${broken} recent chats have a gap or a duplicate message index.`,
      ms: Date.now() - started,
      broken,
      checked: active.length,
    };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'Session check failed.', ms: Date.now() - started };
  }
}

export async function runHealthChecks(): Promise<HealthReport> {
  const [database, llm, media, sessions] = await Promise.all([
    checkDatabase(),
    checkLlm(),
    checkMedia(),
    checkSessions(),
  ]);
  const status = !database.ok ? 'down' : (!llm.ok || !media.ok || !sessions.ok) ? 'degraded' : 'ok';
  return { status, time: new Date().toISOString(), checks: { database, llm, media, sessions } };
}

export function publicHealth(report: HealthReport) {
  const connected = report.checks.database.ok;
  return {
    status: connected ? 'ok' : 'down',
    db: connected ? 'connected' : 'unavailable',
    time: report.time,
    checks: {
      database: connected,
      llm: report.checks.llm.ok,
      media: report.checks.media.ok,
      sessions: report.checks.sessions.ok,
    },
  };
}
