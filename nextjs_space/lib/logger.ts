import 'server-only';

export type LogSeverity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export type LogEntry = {
  severity: LogSeverity;
  source: string;
  message: string;
  route?: string;
  userId?: string | null;
  sessionId?: string | null;
  stack?: string | null;
  meta?: Record<string, unknown>;
  durationMs?: number | null;
};

let writing = false;
let guardsInstalled = false;

function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function redact(value: string): string {
  return value
    .replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[redacted]')
    .replace(/sk-[A-Za-z0-9]{10,}/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/api[_-]?key["']?\s*[:=]\s*["']?[^"'\s]+/gi, 'api_key=[redacted]');
}

function safeId(value?: string | null): string {
  const text = (value ?? '').trim();
  if (!text || text.includes('@') || text.length > 80) return '';
  return text;
}

function consoleFor(severity: LogSeverity): (...args: unknown[]) => void {
  if (severity === 'ERROR' || severity === 'CRITICAL') return console.error;
  return console.log;
}

/** Writes one maintenance event. Failures here are printed and never thrown back to the caller. */
export async function logEvent(entry: LogEntry): Promise<void> {
  const row = {
    severity: entry.severity,
    source: clip(redact(entry.source || 'app'), 40),
    message: clip(redact(entry.message || 'Unknown error'), 1000),
    route: clip(redact(entry.route || ''), 180),
    userId: safeId(entry.userId),
    sessionId: safeId(entry.sessionId),
    stack: clip(redact(entry.stack || ''), 4000),
    meta: clip(redact(JSON.stringify(entry.meta ?? {})), 2000),
    durationMs: typeof entry.durationMs === 'number' && entry.durationMs >= 0 ? Math.round(entry.durationMs) : null,
    createdAt: new Date().toISOString(),
  };
  consoleFor(row.severity)(`[${row.severity}] ${row.source} ${row.route} ${row.message}`);
  if (writing || process.env.NEXT_RUNTIME === 'edge') return;
  writing = true;
  try {
    const { insertMaintenanceLog } = await import('@/lib/maintenance-store');
    await insertMaintenanceLog(row);
  } catch (error) {
    console.error(`[${row.severity}] ${row.source} maintenance log was not stored`, error instanceof Error ? error.message : 'log write failed');
  } finally {
    writing = false;
  }
}

/** Records process-level failures once per server process. */
export function installProcessGuards(): void {
  if (guardsInstalled || process.env.NEXT_RUNTIME === 'edge' || typeof process.on !== 'function') return;
  guardsInstalled = true;
  process.on('uncaughtException', (error) => {
    void logEvent({
      severity: 'CRITICAL',
      source: 'process',
      message: error.message,
      stack: error.stack,
    });
  });
  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(typeof reason === 'string' ? reason : 'Unhandled rejection');
    void logEvent({
      severity: 'CRITICAL',
      source: 'process',
      message: error.message,
      stack: error.stack,
    });
  });
}
