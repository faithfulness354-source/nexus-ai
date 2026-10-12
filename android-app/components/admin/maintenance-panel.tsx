'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { HealthReport } from '@/lib/health';
import type { MaintenanceReport } from '@/lib/maintenance-report';

type LogRow = {
  id: string;
  severity: string;
  source: string;
  message: string;
  route: string;
  sessionId: string;
  durationMs: number | null;
  createdAt: string;
};

type Payload = {
  health: HealthReport;
  report: MaintenanceReport | null;
  recentLogs: LogRow[];
};

function tone(ok: boolean): string {
  return ok ? 'text-emerald-300' : 'text-amber-300';
}

export function MaintenancePanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/maintenance');
    if (!res.ok) {
      toast.error('Maintenance data did not load.');
      return;
    }
    setData(await res.json());
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function runReport() {
    setRunning(true);
    try {
      const res = await fetch('/api/admin/maintenance', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error ?? 'The report did not finish.');
        return;
      }
      toast.success('Maintenance report saved.');
      await load();
    } catch (error) {
      console.error('Maintenance report failed', error);
      toast.error('The report did not finish.');
    } finally {
      setRunning(false);
    }
  }

  const health = data?.health;
  const report = data?.report;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Maintenance</h1>
          <p className="mt-1 text-sm text-muted-foreground">Health, error history, and the latest diagnostic report.</p>
        </div>
        <Button onClick={() => void runReport()} disabled={running}>
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Run diagnostic
        </Button>
      </div>

      {!health ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking the platform…</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ['Database', health.checks.database],
            ['Model host', health.checks.llm],
            ['Media', health.checks.media],
            ['Chat indexes', health.checks.sessions],
          ] as const).map(([label, check]) => (
            <section key={label} className="rounded-xl bg-card p-4 ring-1 ring-white/10">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
              <p className={`mt-2 text-sm font-semibold ${tone(check.ok)}`}>{check.ok ? 'Healthy' : 'Needs attention'}</p>
              <p className="mt-1 text-xs text-muted-foreground">{check.detail}</p>
            </section>
          ))}
        </div>
      )}

      <section className="rounded-xl bg-card p-4 ring-1 ring-white/10">
        <h2 className="text-sm font-semibold">Last 24 hours</h2>
        {report ? (
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-muted-foreground">Active chats</dt><dd className="text-lg font-semibold">{report.usage.activeSessions}</dd></div>
            <div><dt className="text-muted-foreground">Messages</dt><dd className="text-lg font-semibold">{report.usage.messages}</dd></div>
            <div><dt className="text-muted-foreground">Repeated errors</dt><dd className="text-lg font-semibold">{report.errors.length}</dd></div>
            <div><dt className="text-muted-foreground">Missing assets</dt><dd className="text-lg font-semibold">{report.brokenAssets.length}</dd></div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Run a diagnostic to save the first report.</p>
        )}
        {report?.generatedAt ? <p className="mt-3 text-xs text-muted-foreground">Saved {new Date(report.generatedAt).toLocaleString()}</p> : null}
      </section>

      <section className="rounded-xl bg-card p-4 ring-1 ring-white/10">
        <h2 className="text-sm font-semibold">Recent events</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Level</th>
                <th className="py-2 pr-3 font-medium">Route</th>
                <th className="py-2 font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentLogs ?? []).map((row) => (
                <tr key={row.id} className="border-t border-white/5">
                  <td className="py-2 pr-3 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="py-2 pr-3">{row.severity}</td>
                  <td className="py-2 pr-3">{row.route || row.source}</td>
                  <td className="py-2">{row.message}{row.durationMs ? ` (${row.durationMs}ms)` : ''}</td>
                </tr>
              ))}
              {data && data.recentLogs.length === 0 ? (
                <tr><td className="py-3 text-muted-foreground" colSpan={4}>No events stored yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {report && report.brokenAssets.length > 0 ? (
        <section className="rounded-xl bg-card p-4 ring-1 ring-white/10">
          <h2 className="text-sm font-semibold">Missing card media</h2>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {report.brokenAssets.map((asset) => (
              <li key={`${asset.name}-${asset.path}`}>{asset.name}: {asset.path}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {report && report.slowQueries.length > 0 ? (
        <section className="rounded-xl bg-card p-4 ring-1 ring-white/10">
          <h2 className="text-sm font-semibold">Slow queries</h2>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {report.slowQueries.map((query) => (
              <li key={`${query.createdAt}-${query.message}`}>{query.durationMs ?? '?'}ms {query.message}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
