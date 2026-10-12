import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/db';
import { logEvent } from '@/lib/logger';
import { missingLocalAssets, runHealthChecks, type HealthReport } from '@/lib/health';
import { maintenanceLogsSince } from '@/lib/maintenance-store';

export const REPORT_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), 'logs', 'maintenance_reports');

export type ErrorGroup = {
  route: string;
  message: string;
  severity: string;
  count: number;
};

export type MaintenanceReport = {
  generatedAt: string;
  health: HealthReport;
  errors: ErrorGroup[];
  failureRoutes: { route: string; failures: number }[];
  slowQueries: { message: string; durationMs: number | null; createdAt: string }[];
  brokenAssets: { name: string; path: string }[];
  usage: {
    activeSessions: number;
    messages: number;
    userMessages: number;
    assistantMessages: number;
  };
};

type LogRow = {
  severity: string;
  source: string;
  message: string;
  route: string;
  durationMs: number | null;
  createdAt: Date;
};

async function logsSince(since: Date): Promise<LogRow[]> {
  try {
    return await maintenanceLogsSince(since);
  } catch {
    return [];
  }
}

export async function collectMaintenanceReport(): Promise<MaintenanceReport> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [health, logs, dayMessages, brokenAssets] = await Promise.all([
    runHealthChecks(),
    logsSince(since),
    prisma.message.findMany({
      where: { createdAt: { gte: since } },
      select: { sessionId: true, role: true },
    }),
    missingLocalAssets(50),
  ]);

  const grouped = new Map<string, ErrorGroup>();
  for (const row of logs) {
    if (row.severity !== 'ERROR' && row.severity !== 'CRITICAL' && row.severity !== 'WARN') continue;
    const key = `${row.severity}|${row.route}|${row.message}`;
    const current = grouped.get(key);
    if (current) current.count += 1;
    else grouped.set(key, { route: row.route || row.source, message: row.message, severity: row.severity, count: 1 });
  }
  const failures = new Map<string, number>();
  for (const row of logs) {
    if (row.severity !== 'ERROR' && row.severity !== 'CRITICAL') continue;
    const route = row.route || row.source || 'unknown';
    failures.set(route, (failures.get(route) ?? 0) + 1);
  }

  return {
    generatedAt: new Date().toISOString(),
    health,
    errors: [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, 20),
    failureRoutes: [...failures.entries()].map(([route, count]) => ({ route, failures: count })).sort((a, b) => b.failures - a.failures),
    slowQueries: logs
      .filter((row) => row.source === 'prisma' && row.message.startsWith('Slow query'))
      .slice(0, 20)
      .map((row) => ({ message: row.message, durationMs: row.durationMs, createdAt: row.createdAt.toISOString() })),
    brokenAssets,
    usage: {
      activeSessions: new Set(dayMessages.map((row) => row.sessionId)).size,
      messages: dayMessages.length,
      userMessages: dayMessages.filter((row) => row.role === 'USER').length,
      assistantMessages: dayMessages.filter((row) => row.role === 'ASSISTANT').length,
    },
  };
}

function markdown(report: MaintenanceReport): string {
  const lines = [
    `# Nexus AI maintenance report`,
    ``,
    `Generated: ${report.generatedAt}`,
    ``,
    `## Health`,
    ``,
    `- Status: ${report.health.status}`,
    `- Database: ${report.health.checks.database.detail}`,
    `- Model host: ${report.health.checks.llm.detail}`,
    `- Media: ${report.health.checks.media.detail}`,
    `- Chat indexes: ${report.health.checks.sessions.detail}`,
    ``,
    `## Usage, last 24 hours`,
    ``,
    `- Active chats: ${report.usage.activeSessions}`,
    `- Messages: ${report.usage.messages} (${report.usage.userMessages} user, ${report.usage.assistantMessages} assistant)`,
    ``,
    `## Repeated errors`,
    ``,
  ];
  if (report.errors.length === 0) lines.push('- None recorded.');
  else for (const row of report.errors) lines.push(`- ${row.count}× ${row.severity} ${row.route}: ${row.message}`);
  lines.push('', '## Route failures', '');
  if (report.failureRoutes.length === 0) lines.push('- None recorded.');
  else for (const row of report.failureRoutes) lines.push(`- ${row.route}: ${row.failures}`);
  lines.push('', '## Slow queries', '');
  if (report.slowQueries.length === 0) lines.push('- None over the slow-query threshold.');
  else for (const row of report.slowQueries) lines.push(`- ${row.durationMs ?? '?'}ms ${row.message}`);
  lines.push('', '## Missing local assets', '');
  if (report.brokenAssets.length === 0) lines.push('- None found.');
  else for (const row of report.brokenAssets) lines.push(`- ${row.name}: ${row.path}`);
  lines.push('');
  return lines.join('\n');
}

export async function writeMaintenanceReport(report: MaintenanceReport): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(/*turbopackIgnore: true*/ REPORT_DIR, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(/*turbopackIgnore: true*/ REPORT_DIR, `maintenance-${stamp}.json`);
  const markdownPath = path.join(/*turbopackIgnore: true*/ REPORT_DIR, `maintenance-${stamp}.md`);
  await writeFile(/*turbopackIgnore: true*/ jsonPath, JSON.stringify(report, null, 2));
  await writeFile(/*turbopackIgnore: true*/ markdownPath, markdown(report));
  await logEvent({
    severity: 'INFO',
    source: 'maintenance',
    message: 'Maintenance report written',
    route: '/admin/maintenance',
  });
  return { jsonPath, markdownPath };
}

export async function latestMaintenanceReport(): Promise<MaintenanceReport | null> {
  try {
    const names = (await readdir(/*turbopackIgnore: true*/ REPORT_DIR)).filter((name) => name.endsWith('.json')).sort();
    const latest = names.at(-1);
    if (!latest) return null;
    return JSON.parse(await readFile(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ REPORT_DIR, latest), 'utf8')) as MaintenanceReport;
  } catch {
    return null;
  }
}
