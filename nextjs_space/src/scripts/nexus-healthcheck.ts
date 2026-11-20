/**
 * Nexus AI watchdog health & sanity check.
 *
 * Actively probes live Discover/catalog + core Supabase-backed API routes and the
 * database — not homepage HTML or Vercel build status alone.
 *
 * Non-destructive: SELECT / GET only. Never truncates, deletes, or alters card rows.
 *
 * From nextjs_space:
 *   npx tsx --require dotenv/config src/scripts/nexus-healthcheck.ts
 *   npx tsx --require dotenv/config src/scripts/nexus-healthcheck.ts --json
 *   npx tsx --require dotenv/config src/scripts/nexus-healthcheck.ts --sms-test
 *   npx tsx --require dotenv/config src/scripts/nexus-healthcheck.ts --dry-run
 *
 * Exit codes: 0 = healthy (or degraded without critical), 1 = critical failure.
 */
import 'dotenv/config';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  sendCriticalSmsAlert,
  sendWatchdogTestSms,
  smsConfigured,
} from '../lib/notify-sms';

type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

type CheckResult = {
  id: string;
  status: CheckStatus;
  critical: boolean;
  detail: string;
  ms?: number;
  meta?: Record<string, unknown>;
};

type Baseline = {
  publicCardCount?: number;
  sfwPublicCount?: number;
  updatedAt?: string;
};

type Report = {
  ok: boolean;
  critical: boolean;
  time: string;
  baseUrl: string | null;
  checks: CheckResult[];
  sms?: { sent: boolean; skipped: boolean; reason: string };
};

type JsonExpect =
  | { kind: 'array' }
  | { kind: 'object'; requireKeys?: string[] }
  | { kind: 'any-json' };

type ProbeSpec = {
  id: string;
  path: string;
  critical: boolean;
  expect: JsonExpect;
  /** Extra pass/fail logic after HTTP 200 + JSON parse. */
  validate?: (body: unknown, res: Response) => { ok: boolean; detail: string; meta?: Record<string, unknown> };
  timeoutMs?: number;
};

const DEFAULT_PROBE_TIMEOUT_MS = 20_000;

function appRoot(): string {
  const here = process.cwd();
  if (fs.existsSync(path.join(here, 'prisma', 'schema.prisma'))) return here;
  const nested = path.join(here, 'nextjs_space');
  if (fs.existsSync(path.join(nested, 'prisma', 'schema.prisma'))) return nested;
  return here;
}

function parseArgs(argv: string[]) {
  return {
    json: argv.includes('--json'),
    dryRun: argv.includes('--dry-run'),
    smsTest: argv.includes('--sms-test'),
    updateBaseline: argv.includes('--update-baseline'),
  };
}

function baselinePath(): string {
  return path.join(process.cwd(), 'data', 'watchdog-baseline.json');
}

async function readBaseline(): Promise<Baseline> {
  try {
    return JSON.parse(await fsp.readFile(baselinePath(), 'utf8')) as Baseline;
  } catch {
    return {};
  }
}

async function writeBaseline(data: Baseline): Promise<void> {
  await fsp.mkdir(path.dirname(baselinePath()), { recursive: true });
  await fsp.writeFile(baselinePath(), JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2));
}

function siteBaseUrl(): string | null {
  const raw = (
    process.env.NEXUS_HEALTHCHECK_BASE_URL
    || process.env.NEXT_PUBLIC_SITE_URL
    || process.env.NEXTAUTH_URL
    || ''
  ).trim().replace(/\/$/, '');
  return raw || null;
}

function supabaseProjectUrl(): string | null {
  const raw = (
    process.env.NEXT_PUBLIC_SUPABASE_URL
    || process.env.SUPABASE_URL
    || ''
  ).trim().replace(/\/$/, '');
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function supabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    || process.env.SUPABASE_ANON_KEY
    || ''
  ).trim();
}

async function timed<T>(run: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = Date.now();
  const value = await run();
  return { value, ms: Date.now() - started };
}

function clipPayload(value: unknown, limit = 280): string {
  try {
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    if (!raw) return '';
    return raw.length > limit ? `${raw.slice(0, limit)}…` : raw;
  } catch {
    return String(value).slice(0, limit);
  }
}

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err ? String((err as { name?: unknown }).name) : '';
  const message = err instanceof Error ? err.message : String(err);
  return name === 'AbortError' || name === 'TimeoutError' || /aborted|timeout/i.test(message);
}

async function readResponsePayload(res: Response): Promise<{ json: unknown | null; text: string }> {
  const text = await res.text().catch(() => '');
  if (!text) return { json: null, text: '' };
  try {
    return { json: JSON.parse(text) as unknown, text };
  } catch {
    return { json: null, text };
  }
}

function jsonShapeOk(body: unknown, expect: JsonExpect): { ok: boolean; reason: string } {
  if (expect.kind === 'array') {
    return Array.isArray(body)
      ? { ok: true, reason: 'array' }
      : { ok: false, reason: 'expected JSON array' };
  }
  if (expect.kind === 'object') {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { ok: false, reason: 'expected JSON object' };
    }
    for (const key of expect.requireKeys ?? []) {
      if (!(key in (body as Record<string, unknown>))) {
        return { ok: false, reason: `missing key "${key}"` };
      }
    }
    return { ok: true, reason: 'object' };
  }
  if (body === null || body === undefined) {
    return { ok: false, reason: 'empty / non-JSON body' };
  }
  return { ok: true, reason: 'json' };
}

/**
 * Probe one live API path. Critical failure on HTTP 500, timeout, or malformed JSON
 * when HTTP 200 was required. Always logs status + path + error payload in detail/meta.
 */
async function probeEndpoint(baseUrl: string, spec: ProbeSpec): Promise<CheckResult> {
  const pathWithQuery = spec.path.startsWith('/') ? spec.path : `/${spec.path}`;
  const url = `${baseUrl}${pathWithQuery}`;
  const timeoutMs = spec.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'NexusWatchdog/2.0',
  };

  try {
    const { value: res, ms } = await timed(() =>
      fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) }),
    );
    const { json, text } = await readResponsePayload(res);
    const payloadClip = clipPayload(json ?? text);
    const baseMeta = {
      endpoint: pathWithQuery,
      url,
      status: res.status,
      payload: payloadClip || null,
    };

    if (res.status >= 500) {
      return {
        id: spec.id,
        status: 'fail',
        critical: true,
        detail: `HTTP ${res.status} on ${pathWithQuery} — payload: ${payloadClip || '(empty)'}`,
        ms,
        meta: baseMeta,
      };
    }

    if (res.status >= 300 && res.status < 400) {
      return {
        id: spec.id,
        status: 'warn',
        critical: false,
        detail: `HTTP ${res.status} redirect on ${pathWithQuery} (auth/CDN wall) — payload: ${payloadClip || '(empty)'}`,
        ms,
        meta: baseMeta,
      };
    }

    if (res.status !== 200) {
      return {
        id: spec.id,
        status: 'fail',
        critical: spec.critical,
        detail: `HTTP ${res.status} on ${pathWithQuery} (expected 200) — payload: ${payloadClip || '(empty)'}`,
        ms,
        meta: baseMeta,
      };
    }

    const shape = jsonShapeOk(json, spec.expect);
    if (!shape.ok) {
      return {
        id: spec.id,
        status: 'fail',
        critical: true,
        detail: `HTTP 200 on ${pathWithQuery} but malformed JSON (${shape.reason}) — payload: ${payloadClip || '(empty)'}`,
        ms,
        meta: { ...baseMeta, parseError: shape.reason },
      };
    }

    if (spec.validate) {
      const verdict = spec.validate(json, res);
      return {
        id: spec.id,
        status: verdict.ok ? 'pass' : 'fail',
        critical: spec.critical,
        detail: verdict.ok
          ? verdict.detail
          : `HTTP 200 on ${pathWithQuery} failed validation: ${verdict.detail} — payload: ${payloadClip || '(empty)'}`,
        ms,
        meta: { ...baseMeta, ...(verdict.meta ?? {}) },
      };
    }

    return {
      id: spec.id,
      status: 'pass',
      critical: spec.critical,
      detail: `HTTP 200 on ${pathWithQuery} — JSON ok.`,
      ms,
      meta: baseMeta,
    };
  } catch (err) {
    const timeout = isTimeoutError(err);
    const message = err instanceof Error ? err.message : String(err);
    return {
      id: spec.id,
      status: 'fail',
      critical: true,
      detail: timeout
        ? `TIMEOUT after ${timeoutMs}ms on ${pathWithQuery} — ${message}`
        : `Request failed on ${pathWithQuery} — ${message}`,
      meta: {
        endpoint: pathWithQuery,
        url,
        status: timeout ? 'timeout' : 'network_error',
        payload: message.slice(0, 280),
      },
    };
  }
}

async function checkDatabase(prisma: PrismaClient): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  // Empty / missing DATABASE_URL is a CI configuration gap, not a live outage.
  if (!process.env.DATABASE_URL?.trim()) {
    out.push({
      id: 'database',
      status: 'skip',
      critical: false,
      detail: 'DATABASE_URL is unset — configure GitHub Actions / local secrets to enable DB checks.',
    });
    return out;
  }
  try {
    const { ms } = await timed(() => prisma.$queryRaw`SELECT 1`);
    out.push({ id: 'database', status: 'pass', critical: true, detail: 'Database ping ok.', ms });
  } catch (err) {
    out.push({
      id: 'database',
      status: 'fail',
      critical: true,
      detail: err instanceof Error ? err.message : 'Database ping failed.',
    });
    return out;
  }

  try {
    const { value, ms } = await timed(async () => {
      const [total, publicCards, sfwPublic, nsfwPublic] = await Promise.all([
        prisma.character.count(),
        prisma.character.count({ where: { visibility: 'PUBLIC', moderated: false } }),
        prisma.character.count({ where: { visibility: 'PUBLIC', moderated: false, nsfw: false } }),
        prisma.character.count({ where: { visibility: 'PUBLIC', moderated: false, nsfw: true } }),
      ]);
      return { total, publicCards, sfwPublic, nsfwPublic };
    });
    out.push({
      id: 'card_counts',
      status: 'pass',
      critical: false,
      detail: `total=${value.total} public=${value.publicCards} sfwPublic=${value.sfwPublic} nsfwPublic=${value.nsfwPublic}`,
      ms,
      meta: value,
    });

    const { value: badCount, ms: ms2 } = await timed(async () => {
      try {
        return await prisma.character.count({ where: { name: '' } });
      } catch {
        const rows = await prisma.$queryRaw<Array<{ c: number }>>`
          SELECT COUNT(*)::int AS c FROM "Character" WHERE name = '' OR name IS NULL
        `.catch(() => [{ c: 0 }]);
        return Number(rows[0]?.c ?? 0);
      }
    });
    out.push({
      id: 'card_integrity',
      status: badCount > 0 ? 'warn' : 'pass',
      critical: false,
      detail: badCount > 0 ? `${badCount} cards have empty/null names.` : 'No empty-name cards detected.',
      ms: ms2,
      meta: { emptyNameCards: badCount },
    });
  } catch (err) {
    out.push({
      id: 'card_counts',
      status: 'fail',
      critical: true,
      detail: err instanceof Error ? err.message : 'Card count query failed.',
    });
  }

  return out;
}

async function checkCardCountDrop(counts: CheckResult): Promise<CheckResult> {
  const meta = (counts.meta ?? {}) as { publicCards?: number; sfwPublic?: number };
  const baseline = await readBaseline();
  if (baseline.publicCardCount == null || meta.publicCards == null) {
    return {
      id: 'card_count_drop',
      status: 'skip',
      critical: true,
      detail: baseline.publicCardCount == null
        ? 'No baseline yet — run with --update-baseline after a healthy check.'
        : 'Public count unavailable.',
      meta: { baseline, current: meta },
    };
  }
  const current = meta.publicCards;
  const prior = baseline.publicCardCount;
  const dropped = prior - current;
  const ratio = prior > 0 ? current / prior : 1;
  const criticalDrop = prior >= 5 && dropped >= 5 && ratio <= 0.5;
  if (criticalDrop) {
    return {
      id: 'card_count_drop',
      status: 'fail',
      critical: true,
      detail: `Public cards dropped from ${prior} → ${current} (≥50% loss).`,
      meta: { baseline, current: meta },
    };
  }
  if (dropped > 0) {
    return {
      id: 'card_count_drop',
      status: 'warn',
      critical: false,
      detail: `Public cards ${prior} → ${current} (drop ${dropped}, under critical threshold).`,
      meta: { baseline, current: meta },
    };
  }
  return {
    id: 'card_count_drop',
    status: 'pass',
    critical: true,
    detail: `Public cards stable (${current}, baseline ${prior}).`,
    meta: { baseline, current: meta },
  };
}

async function checkLiveApis(baseUrl: string): Promise<CheckResult[]> {
  const out: CheckResult[] = [];

  const discover = await probeEndpoint(baseUrl, {
    id: 'discover_api',
    path: '/api/characters?nsfw=false',
    critical: true,
    expect: { kind: 'array' },
    validate: (body) => {
      const list = body as unknown[];
      return {
        ok: true,
        detail: `HTTP 200 on /api/characters?nsfw=false — ${list.length} cards visible.`,
        meta: { visible: list.length },
      };
    },
  });
  out.push(discover);

  if (discover.status === 'pass') {
    const visible = Number((discover.meta as { visible?: number } | undefined)?.visible ?? 0);
    out.push({
      id: 'discover_zero_cards',
      status: visible === 0 ? 'fail' : 'pass',
      critical: true,
      detail: visible === 0
        ? 'HTTP 200 on /api/characters?nsfw=false but catalog array is empty (0 cards).'
        : `Discover catalog has ${visible} card(s).`,
      meta: {
        endpoint: '/api/characters?nsfw=false',
        status: 200,
        payload: `visible=${visible}`,
      },
    });
  } else if (discover.status === 'fail') {
    out.push({
      id: 'discover_zero_cards',
      status: 'fail',
      critical: true,
      detail: `Skipped card-count validation because Discover probe failed: ${discover.detail}`,
      meta: discover.meta,
    });
  }

  out.push(await probeEndpoint(baseUrl, {
    id: 'api_health',
    path: '/api/health',
    critical: true,
    expect: { kind: 'object' },
    validate: (body) => {
      const obj = body as { status?: string; db?: string };
      const down = obj.status === 'down' || obj.db === 'unavailable';
      return {
        ok: !down,
        detail: down
          ? `Health reports down/unavailable (${clipPayload(obj)})`
          : `Health ok (status=${obj.status ?? 'ok'}).`,
        meta: { health: obj },
      };
    },
  }));

  // Back-compat alias used by older reports / SMS fingerprints.
  const health = out.find((c) => c.id === 'api_health');
  if (health) {
    out.push({
      ...health,
      id: 'profile_path',
      detail: health.detail.replace('/api/health', 'health/profile data path'),
    });
  }

  out.push(await probeEndpoint(baseUrl, {
    id: 'api_live',
    path: '/api/live',
    critical: true,
    expect: { kind: 'object', requireKeys: ['ok'] },
    validate: (body) => {
      const obj = body as { ok?: unknown; revision?: unknown };
      const ok = obj.ok === true;
      return {
        ok,
        detail: ok
          ? `Live revision stamp ok (revision=${String(obj.revision ?? '')}).`
          : `Live endpoint missing ok:true (${clipPayload(obj)})`,
        meta: { live: obj },
      };
    },
  }));

  const probeUser = process.env.NEXUS_HEALTHCHECK_PROFILE_USER?.trim();
  if (probeUser) {
    try {
      const profilePath = `/u/${encodeURIComponent(probeUser)}`;
      const { value: res, ms } = await timed(() =>
        fetch(`${baseUrl}${profilePath}`, {
          headers: { 'User-Agent': 'NexusWatchdog/2.0' },
          redirect: 'manual',
          signal: AbortSignal.timeout(25_000),
        }),
      );
      const text = await res.text().catch(() => '');
      if (res.status >= 500) {
        out.push({
          id: 'profile_page',
          status: 'fail',
          critical: true,
          detail: `HTTP ${res.status} on ${profilePath} — payload: ${clipPayload(text)}`,
          ms,
          meta: { endpoint: profilePath, status: res.status, payload: clipPayload(text) },
        });
      } else {
        out.push({
          id: 'profile_page',
          status: res.status === 404 ? 'warn' : 'pass',
          critical: false,
          detail: `HTTP ${res.status} on ${profilePath}`,
          ms,
          meta: { endpoint: profilePath, status: res.status },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      out.push({
        id: 'profile_page',
        status: 'fail',
        critical: true,
        detail: isTimeoutError(err)
          ? `TIMEOUT on /u/${probeUser} — ${message}`
          : `Request failed on /u/${probeUser} — ${message}`,
        meta: {
          endpoint: `/u/${probeUser}`,
          status: isTimeoutError(err) ? 'timeout' : 'network_error',
          payload: message.slice(0, 280),
        },
      });
    }
  }

  return out;
}

async function checkSupabaseRest(): Promise<CheckResult> {
  const origin = supabaseProjectUrl();
  const anon = supabaseAnonKey();
  if (!origin) {
    return {
      id: 'supabase_rest',
      status: 'skip',
      critical: false,
      detail: 'NEXT_PUBLIC_SUPABASE_URL unset — skipping direct Supabase REST probe.',
    };
  }
  if (!anon) {
    return {
      id: 'supabase_rest',
      status: 'skip',
      critical: false,
      detail: 'Supabase anon key unset — skipping direct REST probe (app /api/health still covers DB).',
    };
  }

  const endpoint = '/rest/v1/';
  const url = `${origin}${endpoint}`;
  try {
    const { value: res, ms } = await timed(() =>
      fetch(url, {
        method: 'GET',
        headers: {
          apikey: anon,
          Authorization: `Bearer ${anon}`,
          Accept: 'application/json',
          'User-Agent': 'NexusWatchdog/2.0',
        },
        signal: AbortSignal.timeout(15_000),
      }),
    );
    const { json, text } = await readResponsePayload(res);
    const payload = clipPayload(json ?? text);
    if (res.status >= 500) {
      return {
        id: 'supabase_rest',
        status: 'fail',
        critical: true,
        detail: `HTTP ${res.status} on Supabase ${endpoint} — payload: ${payload || '(empty)'}`,
        ms,
        meta: { endpoint: `${origin}${endpoint}`, status: res.status, payload },
      };
    }
    // PostgREST root often returns 200 HTML/JSON or 404 OpenAPI — treat 2xx/404 as reachable.
    if (res.status >= 200 && res.status < 500) {
      return {
        id: 'supabase_rest',
        status: 'pass',
        critical: true,
        detail: `Supabase REST reachable (HTTP ${res.status} on ${endpoint}).`,
        ms,
        meta: { endpoint: `${origin}${endpoint}`, status: res.status, payload: payload || null },
      };
    }
    return {
      id: 'supabase_rest',
      status: 'fail',
      critical: true,
      detail: `Unexpected HTTP ${res.status} on Supabase ${endpoint} — payload: ${payload || '(empty)'}`,
      ms,
      meta: { endpoint: `${origin}${endpoint}`, status: res.status, payload },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      id: 'supabase_rest',
      status: 'fail',
      critical: true,
      detail: isTimeoutError(err)
        ? `TIMEOUT on Supabase ${endpoint} — ${message}`
        : `Supabase REST request failed — ${message}`,
      meta: {
        endpoint: url,
        status: isTimeoutError(err) ? 'timeout' : 'network_error',
        payload: message.slice(0, 280),
      },
    };
  }
}

function printHuman(report: Report): void {
  console.log(`Nexus watchdog @ ${report.time}`);
  console.log(`baseUrl=${report.baseUrl ?? '(none — DB / Supabase checks only)'}`);
  for (const check of report.checks) {
    const mark = check.status === 'pass' ? 'PASS' : check.status === 'warn' ? 'WARN' : check.status === 'skip' ? 'SKIP' : 'FAIL';
    const crit = check.critical && check.status === 'fail' ? ' [CRITICAL]' : '';
    const metaStatus = check.meta && 'status' in check.meta ? ` status=${String(check.meta.status)}` : '';
    const metaPath = check.meta && 'endpoint' in check.meta ? ` endpoint=${String(check.meta.endpoint)}` : '';
    console.log(`  [${mark}]${crit} ${check.id}: ${check.detail}${check.ms != null ? ` (${check.ms}ms)` : ''}${metaPath}${metaStatus}`);
  }
  if (report.sms) {
    console.log(`  SMS: sent=${report.sms.sent} skipped=${report.sms.skipped} reason=${report.sms.reason}`);
  }
  console.log(report.critical ? 'RESULT: CRITICAL' : report.ok ? 'RESULT: OK' : 'RESULT: DEGRADED');
}

async function main(): Promise<void> {
  process.chdir(appRoot());
  const args = parseArgs(process.argv.slice(2));

  if (args.smsTest) {
    if (args.dryRun) {
      console.log(`SMS configured=${smsConfigured()} (dry-run — not sending)`);
      process.exit(0);
    }
    const result = await sendWatchdogTestSms(true);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.sent || result.skipped ? 0 : 1);
  }

  const prisma = new PrismaClient();
  const checks: CheckResult[] = [];
  const baseUrl = siteBaseUrl();

  try {
    const dbChecks = await checkDatabase(prisma);
    checks.push(...dbChecks);

    const counts = dbChecks.find((c) => c.id === 'card_counts');
    if (counts?.status === 'pass') {
      checks.push(await checkCardCountDrop(counts));
      if (args.updateBaseline && counts.meta) {
        const meta = counts.meta as { publicCards?: number; sfwPublic?: number };
        await writeBaseline({
          publicCardCount: meta.publicCards ?? 0,
          sfwPublicCount: meta.sfwPublic ?? 0,
        });
        console.log('Baseline updated.');
      }
    }

    checks.push(await checkSupabaseRest());

    if (baseUrl) {
      checks.push(...await checkLiveApis(baseUrl));
    } else {
      checks.push({
        id: 'discover_api',
        status: 'skip',
        critical: false,
        detail: 'Set NEXUS_HEALTHCHECK_BASE_URL or NEXT_PUBLIC_SITE_URL to probe live Discover/catalog APIs.',
      });
      checks.push({
        id: 'api_health',
        status: 'skip',
        critical: false,
        detail: 'HTTP base URL not configured — skipping /api/health probe.',
      });
      checks.push({
        id: 'api_live',
        status: 'skip',
        critical: false,
        detail: 'HTTP base URL not configured — skipping /api/live probe.',
      });
      checks.push({
        id: 'profile_path',
        status: 'skip',
        critical: false,
        detail: 'HTTP base URL not configured — skipping live health/profile probes.',
      });
    }
  } finally {
    await prisma.$disconnect();
  }

  const alertable = checks.filter((c) => c.critical && c.status === 'fail');
  const report: Report = {
    ok: checks.every((c) => c.status === 'pass' || c.status === 'skip' || c.status === 'warn'),
    critical: alertable.length > 0,
    time: new Date().toISOString(),
    baseUrl,
    checks,
  };

  if (report.critical && !args.dryRun) {
    const summary = alertable
      .map((c) => {
        const status = c.meta && 'status' in c.meta ? ` status=${String(c.meta.status)}` : '';
        const endpoint = c.meta && 'endpoint' in c.meta ? ` ${String(c.meta.endpoint)}` : '';
        const payload = c.meta && 'payload' in c.meta && c.meta.payload
          ? ` payload=${clipPayload(c.meta.payload, 120)}`
          : '';
        return `${c.id}:${endpoint}${status}${payload} — ${c.detail}`;
      })
      .join(' | ')
      .slice(0, 900);
    const sms = await sendCriticalSmsAlert({
      kind: 'healthcheck_critical',
      summary,
      detail: `checks=${alertable.map((c) => c.id).join(',')}`,
      fingerprint: `critical:${alertable.map((c) => c.id).sort().join('+')}`,
    });
    report.sms = { sent: sms.sent, skipped: sms.skipped, reason: sms.reason };
  } else if (report.critical && args.dryRun) {
    report.sms = { sent: false, skipped: true, reason: 'dry_run' };
  }

  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);

  process.exit(report.critical ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
