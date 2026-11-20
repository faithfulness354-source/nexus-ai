/**
 * SMS alert helper for Nexus AI watchdog checks.
 *
 * Uses Twilio REST API when configured. Never logs the destination number in full.
 * Cooldown / dedupe prevents the same critical fingerprint from spamming texts.
 *
 * Env:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_NUMBER
 *   ALERT_TO_PHONE_NUMBER
 *   ALERT_SMS_COOLDOWN_MINUTES (default 60)
 *   ALERT_SMS_WEBHOOK_URL (optional alternate POST webhook instead of Twilio)
 *
 * Server-only — keeps Node `fs` / Twilio helpers out of the Next client graph
 * so Vercel production builds are not pulled into browser bundles.
 */
import 'server-only';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

export type SmsSendResult = {
  sent: boolean;
  skipped: boolean;
  reason: string;
  fingerprint?: string;
};

type CooldownStore = {
  /** fingerprint → ISO timestamp of last successful send */
  lastSent: Record<string, string>;
};

const DEFAULT_COOLDOWN_MIN = 60;

function cooldownPath(): string {
  const override = process.env.ALERT_SMS_COOLDOWN_FILE?.trim();
  if (override) return override;
  return path.join(process.cwd(), 'data', 'watchdog-sms-cooldown.json');
}

function cooldownMinutes(): number {
  const raw = Number(process.env.ALERT_SMS_COOLDOWN_MINUTES ?? DEFAULT_COOLDOWN_MIN);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_COOLDOWN_MIN;
}

/** Mask phone for logs: +1555***1234 */
export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 6) return '***';
  return `***${digits.slice(-4)}`;
}

export function smsConfigured(): boolean {
  if (process.env.ALERT_SMS_WEBHOOK_URL?.trim()) return true;
  return !!(
    process.env.TWILIO_ACCOUNT_SID?.trim()
    && process.env.TWILIO_AUTH_TOKEN?.trim()
    && process.env.TWILIO_FROM_NUMBER?.trim()
    && process.env.ALERT_TO_PHONE_NUMBER?.trim()
  );
}

export function failureFingerprint(kind: string, detail: string): string {
  const normalized = `${kind}|${detail}`.toLowerCase().replace(/\s+/g, ' ').slice(0, 500);
  return createHash('sha256').update(normalized).digest('hex').slice(0, 24);
}

async function readStore(): Promise<CooldownStore> {
  try {
    const raw = await fsp.readFile(cooldownPath(), 'utf8');
    const parsed = JSON.parse(raw) as CooldownStore;
    if (!parsed || typeof parsed !== 'object' || !parsed.lastSent) return { lastSent: {} };
    return { lastSent: parsed.lastSent ?? {} };
  } catch {
    return { lastSent: {} };
  }
}

async function writeStore(store: CooldownStore): Promise<void> {
  const file = cooldownPath();
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(store, null, 2));
}

function stillCooling(store: CooldownStore, fingerprint: string): boolean {
  const last = store.lastSent[fingerprint];
  if (!last) return false;
  const then = Date.parse(last);
  if (!Number.isFinite(then)) return false;
  return Date.now() - then < cooldownMinutes() * 60_000;
}

async function sendTwilio(body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID!.trim();
  const token = process.env.TWILIO_AUTH_TOKEN!.trim();
  const from = process.env.TWILIO_FROM_NUMBER!.trim();
  const to = process.env.ALERT_TO_PHONE_NUMBER!.trim();
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const params = new URLSearchParams({ To: to, From: from, Body: body.slice(0, 1500) });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Twilio ${res.status}: ${text.slice(0, 200)}`);
  }
}

async function sendWebhook(body: string, fingerprint: string): Promise<void> {
  const url = process.env.ALERT_SMS_WEBHOOK_URL!.trim();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: body,
      fingerprint,
      source: 'nexus-watchdog',
      sentAt: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`SMS webhook ${res.status}: ${text.slice(0, 200)}`);
  }
}

/**
 * Send a critical-failure SMS if configured and not in cooldown for this fingerprint.
 * Always safe: missing env → skipped with a log-friendly reason (never throws to callers
 * unless `throwOnError` is set).
 */
export async function sendCriticalSmsAlert(opts: {
  kind: string;
  summary: string;
  detail?: string;
  /** Override fingerprint; default hashes kind+summary. */
  fingerprint?: string;
  throwOnError?: boolean;
}): Promise<SmsSendResult> {
  const fingerprint = opts.fingerprint || failureFingerprint(opts.kind, opts.summary);
  const timestamp = new Date().toISOString();
  const body = [
    `Nexus AI CRITICAL: ${opts.kind}`,
    opts.summary.slice(0, 400),
    opts.detail ? opts.detail.slice(0, 400) : '',
    `UTC ${timestamp}`,
  ].filter(Boolean).join('\n');

  if (!smsConfigured()) {
    console.warn(
      `[notify-sms] skipped (not configured) kind=${opts.kind} fingerprint=${fingerprint}`,
    );
    return { sent: false, skipped: true, reason: 'sms_not_configured', fingerprint };
  }

  const store = await readStore();
  if (stillCooling(store, fingerprint)) {
    console.warn(
      `[notify-sms] cooldown active kind=${opts.kind} fingerprint=${fingerprint} window=${cooldownMinutes()}m`,
    );
    return { sent: false, skipped: true, reason: 'cooldown', fingerprint };
  }

  try {
    if (process.env.ALERT_SMS_WEBHOOK_URL?.trim()) {
      await sendWebhook(body, fingerprint);
    } else {
      const to = process.env.ALERT_TO_PHONE_NUMBER || '';
      console.info(`[notify-sms] sending via Twilio to ${maskPhone(to)} kind=${opts.kind}`);
      await sendTwilio(body);
    }
    store.lastSent[fingerprint] = timestamp;
    // Prune entries older than 7 days.
    const week = 7 * 24 * 60 * 60 * 1000;
    for (const [key, iso] of Object.entries(store.lastSent)) {
      const t = Date.parse(iso);
      if (!Number.isFinite(t) || Date.now() - t > week) delete store.lastSent[key];
    }
    await writeStore(store);
    return { sent: true, skipped: false, reason: 'sent', fingerprint };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[notify-sms] send failed: ${message}`);
    if (opts.throwOnError) throw err;
    return { sent: false, skipped: false, reason: `send_failed:${message.slice(0, 120)}`, fingerprint };
  }
}

/** Test helper — bypasses cooldown when `force` is true. */
export async function sendWatchdogTestSms(force = false): Promise<SmsSendResult> {
  if (force) {
    try {
      const store = await readStore();
      delete store.lastSent['watchdog-test'];
      await writeStore(store);
    } catch {
      /* ignore */
    }
  }
  return sendCriticalSmsAlert({
    kind: 'watchdog_test',
    summary: 'Nexus watchdog SMS test — no production failure.',
    fingerprint: 'watchdog-test',
  });
}

/** Sync existence check used by docs / CI dry runs. */
export function notifySmsModuleLoaded(): boolean {
  return typeof fs.existsSync === 'function';
}
