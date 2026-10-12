export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { forbidden, getViewer, unauthorized } from '@/lib/access';
import { runHealthChecks } from '@/lib/health';
import { logEvent } from '@/lib/logger';
import { collectMaintenanceReport, latestMaintenanceReport, writeMaintenanceReport } from '@/lib/maintenance-report';
import { recentMaintenanceLogs } from '@/lib/maintenance-store';

async function creator() {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  if (!viewer.isCreatorAdmin) return forbidden('Only the site creator can view maintenance.');
  return viewer;
}

export async function GET() {
  const viewer = await creator();
  if (viewer instanceof Response) return viewer;
  try {
    const [health, saved, recentLogs] = await Promise.all([
      runHealthChecks(),
      latestMaintenanceReport(),
      recentMaintenanceLogs(40).catch(() => []),
    ]);
    return NextResponse.json({ health, report: saved, recentLogs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load maintenance';
    void logEvent({ severity: 'ERROR', source: 'maintenance', message, route: '/api/admin/maintenance', stack: error instanceof Error ? error.stack : '' });
    return NextResponse.json({ error: 'Failed to load maintenance.' }, { status: 500 });
  }
}

export async function POST() {
  const viewer = await creator();
  if (viewer instanceof Response) return viewer;
  try {
    const report = await collectMaintenanceReport();
    const files = await writeMaintenanceReport(report);
    return NextResponse.json({ report, files: { json: files.jsonPath.split(/[/\\]/).pop(), markdown: files.markdownPath.split(/[/\\]/).pop() } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to write maintenance report';
    void logEvent({ severity: 'ERROR', source: 'maintenance', message, route: '/api/admin/maintenance', stack: error instanceof Error ? error.stack : '', userId: viewer.user.id });
    return NextResponse.json({ error: 'Failed to write the maintenance report.' }, { status: 500 });
  }
}
