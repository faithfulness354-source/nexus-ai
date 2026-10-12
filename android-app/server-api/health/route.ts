export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/access';
import { publicHealth, runHealthChecks } from '@/lib/health';
import { logEvent } from '@/lib/logger';

export async function GET() {
  try {
    const [viewer, report] = await Promise.all([getViewer(), runHealthChecks()]);
    if (report.status === 'down') {
      void logEvent({
        severity: 'CRITICAL',
        source: 'health',
        message: report.checks.database.detail,
        route: '/api/health',
      });
    }
    if (viewer?.isCreatorAdmin) return NextResponse.json(report);
    return NextResponse.json(publicHealth(report));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Health check failed';
    void logEvent({ severity: 'CRITICAL', source: 'health', message, route: '/api/health', stack: error instanceof Error ? error.stack : '' });
    return NextResponse.json({ status: 'down', time: new Date().toISOString() }, { status: 503 });
  }
}
