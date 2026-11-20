/**
 * Nexus AI watchdog — two-tier self-healing monitor.
 *
 * Tier 1 (autonomous): on transient HTTP 404/500/502/503/504 or timeout, retry with
 * backoff, re-warm the route, verify Supabase connectivity, and re-probe. Log heals.
 *
 * Tier 2 (escalation): if the failure persists (or JSON is malformed), do NOT mutate
 * source or push blind commits. Write watchdog-escalation.md + a ready-to-paste Cursor
 * prompt, and SMS-alert for critical failures.
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

type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip' | 'healed';

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

type HealIncident = {
  timestamp: string;
  endpoint: string;
  checkId: string;
  initialError: string;
  initialStatus: string | number;
  recoveryActions: string[];
  verifiedResult: string;
};

type EscalationRecord = {
  timestamp: string;
  endpoint: string;
  checkId: string;
  statusCode: string | number;
  responseBody: string;
  detail: string;
  suspectedFiles: string[];
  recoveryAttempted: string[];
};

type Report = {
  ok: boolean;
  critical: boolean;
  time: string;
  baseUrl: string | null;
  checks: CheckResult[];
  heals?: HealIncident[];
  escalations?: EscalationRecord[];
  sms?: { sent: boolean; skipped: boolean; reason: string };
  cursorPrompt?: string;
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
  /** When true, Tier-1 self-heal runs on transient failures. Default true for live APIs. */
  selfHeal?: boolean;
};

const DEFAULT_PROBE_TIMEOUT_MS = 20_000;
const SELF_HEAL_ATTEMPTS = 3;
const SELF_HEAL_BACKOFF_MS = [1_000, 2_000, 4_000] as const;
const TRANSIENT_HTTP = new Set([404, 500, 502, 503, 504]);

const SUSPECTED_FILES: Record<string, string[]> = {
  discover_api: [
    'nextjs_space/app/api/characters/route.ts',
    'nextjs_space/src/proxy.ts',
    'nextjs_space/lib/access.ts',
    'nextjs_space/prisma/schema.prisma',
  ],
  discover_zero_cards: [
    'nextjs_space/app/api/characters/route.ts',
    'nextjs_space/prisma/schema.prisma',
  ],
  api_health: [
    'nextjs_space/app/api/health/route.ts',
    'nextjs_space/lib/db.ts',
    'nextjs_space/prisma/schema.prisma',
  ],
  api_live: [
    'nextjs_space/app/api/live/route.ts',
  ],
  profile_path: [
    'nextjs_space/app/api/health/route.ts',
    'nextjs_space/app/api/profile/route.ts',
  ],
  profile_page: [
    'nextjs_space/app/u/[username]/page.tsx',
    'nextjs_space/lib/access.ts',
  ],
  supabase_rest: [
    'nextjs_space/.env / Vercel env (NEXT_PUBLIC_SUPABASE_URL, anon key)',
    'nextjs_space/lib/supabase*.ts',
  ],
  database: [
    'nextjs_space/prisma/schema.prisma',
    'DATABASE_URL / DIRECT_URL secrets',
  ],
};

function appRoot(): string {
  const here = process.cwd();
  if (fs.existsSync(path.join(here, 'prisma', 'schema.prisma'))) return here;
  const nested = path.join(here, 'nextjs_space');
  if (fs.existsSync(path.join(nested, 'prisma', 'schema.prisma'))) return nested;
  return here;
}

function repoRoot(): string {
  const root = appRoot();
  const parent = path.dirname(root);
  if (path.basename(root) === 'nextjs_space' && fs.existsSync(path.join(parent, '.git'))) {
    return parent;
  }
  if (fs.existsSync(path.join(root, '.git'))) return root;
  return parent;
}

function parseArgs(argv: string[]) {
  return {
    json: argv.includes('--json'),
    dryRun: argv.includes('--dry-run'),
    smsTest: argv.includes('--sms-test'),
    updateBaseline: argv.includes('--update-baseline'),
    noHeal: argv.includes('--no-heal'),
  };
}

function baselinePath(): string {
  return path.join(process.cwd(), 'data', 'watchdog-baseline.json');
}

function healLogPath(): string {
  return path.join(process.cwd(), 'data', 'watchdog-heal-log.jsonl');
}

function escalationPath(): string {
  return path.join(repoRoot(), 'watchdog-escalation.md');
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function metaStatus(result: CheckResult): string | number {
  const s = result.meta?.status;
  if (typeof s === 'number' || typeof s === 'string') return s;
  return 'unknown';
}

/** Tier-1 candidates: transient gateway/runtime errors worth autonomous recovery. */
function isTransientProbeFailure(result: CheckResult): boolean {
  if (result.status !== 'fail') return false;
  const status = metaStatus(result);
  if (status === 'timeout' || status === 'network_error') return true;
  if (typeof status === 'number' && TRANSIENT_HTTP.has(status)) return true;
  // Cold/truncated responses sometimes look like malformed JSON — allow one heal cycle.
  if (/malformed JSON/i.test(result.detail)) return true;
  return false;
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
    'User-Agent': 'NexusWatchdog/3.0',
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

/** Safe runtime recovery: cache-bust GET to wake a cold Next.js route. */
async function rewarmRoute(baseUrl: string, routePath: string): Promise<string> {
  const pathWithQuery = routePath.startsWith('/') ? routePath : `/${routePath}`;
  const sep = pathWithQuery.includes('?') ? '&' : '?';
  const url = `${baseUrl}${pathWithQuery}${sep}_watchdog_warm=${Date.now()}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'User-Agent': 'NexusWatchdog/3.0-rewarm',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(25_000),
    });
    await res.text().catch(() => '');
    return `rewarm ${pathWithQuery} → HTTP ${res.status}`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `rewarm ${pathWithQuery} failed: ${message.slice(0, 120)}`;
  }
}

async function verifySupabaseConnectivity(): Promise<{ ok: boolean; action: string }> {
  const origin = supabaseProjectUrl();
  const anon = supabaseAnonKey();
  if (!origin || !anon) {
    return { ok: true, action: 'supabase skip (URL/anon unset)' };
  }
  try {
    const res = await fetch(`${origin}/rest/v1/`, {
      method: 'GET',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        Accept: 'application/json',
        'User-Agent': 'NexusWatchdog/3.0-heal',
      },
      signal: AbortSignal.timeout(15_000),
    });
    await res.text().catch(() => '');
    const ok = res.status < 500;
    return {
      ok,
      action: `supabase REST HTTP ${res.status}${ok ? '' : ' (still unhealthy)'}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, action: `supabase REST failed: ${message.slice(0, 120)}` };
  }
}

async function appendHealLog(incident: HealIncident): Promise<void> {
  await fsp.mkdir(path.dirname(healLogPath()), { recursive: true });
  await fsp.appendFile(healLogPath(), `${JSON.stringify(incident)}\n`, 'utf8');
}

function suspectedFilesFor(checkId: string, endpoint: string): string[] {
  const mapped = SUSPECTED_FILES[checkId];
  if (mapped?.length) return mapped;
  if (endpoint.includes('/api/characters')) return SUSPECTED_FILES.discover_api;
  if (endpoint.includes('/api/health')) return SUSPECTED_FILES.api_health;
  if (endpoint.includes('/api/live')) return SUSPECTED_FILES.api_live;
  return [
    'nextjs_space/app/api/**',
    'nextjs_space/src/proxy.ts',
    'nextjs_space/lib/access.ts',
  ];
}

function buildCursorPrompt(escalations: EscalationRecord[]): string {
  const blocks = escalations.map((e, i) => {
    return `### Failure ${i + 1}: \`${e.checkId}\`
- **Endpoint:** \`${e.endpoint}\`
- **Status:** \`${e.statusCode}\`
- **Detail:** ${e.detail}
- **Response body:** \`\`\`
${e.responseBody || '(empty)'}
\`\`\`
- **Recovery already attempted:** ${e.recoveryAttempted.join('; ') || '(none)'}
- **Suspected files:** ${e.suspectedFiles.map((f) => `\`${f}\``).join(', ')}`;
  }).join('\n\n');

  return `Fix these persistent Nexus AI production API failures. Do NOT guess — inspect the live error payloads and the suspected files, then patch only what is broken. Do not push blind commits; verify with \`npm run build\` in \`nextjs_space\` and a live probe of the failing endpoints before committing.

## Persistent watchdog failures (Tier 2 — self-heal exhausted)

${blocks}

## Acceptance criteria
1. Each listed endpoint returns HTTP 200 with well-formed JSON (Discover = array of cards).
2. \`npm run build\` in \`nextjs_space\` exits 0.
3. Re-run: \`npm run watchdog:dry\` against production and confirm RESULT: OK.
4. Commit and push only after local verification.`;
}

async function writeEscalationFile(
  escalations: EscalationRecord[],
  cursorPrompt: string,
): Promise<string> {
  const file = escalationPath();
  const body = `# Nexus Watchdog Escalation

**Generated:** ${new Date().toISOString()}
**Policy:** Tier-2 persistent failure — **no autonomous source edits or blind pushes to main.**

## Failures

${escalations.map((e) => `### \`${e.checkId}\`
| Field | Value |
| --- | --- |
| Timestamp | ${e.timestamp} |
| Endpoint | \`${e.endpoint}\` |
| Status code | \`${e.statusCode}\` |
| Detail | ${e.detail.replace(/\|/g, '\\|')} |
| Suspected files | ${e.suspectedFiles.map((f) => `\`${f}\``).join(', ')} |
| Recovery attempted | ${e.recoveryAttempted.join('; ') || '(none)'} |

**Response body:**

\`\`\`json
${e.responseBody || '(empty)'}
\`\`\`
`).join('\n')}

## Ready-to-paste Cursor prompt

\`\`\`
${cursorPrompt}
\`\`\`
`;
  await fsp.writeFile(file, body, 'utf8');
  return file;
}

/**
 * Tier 1 wrapper: probe → on transient failure, backoff + rewarm + supabase + re-probe.
 * Returns healed (status=healed) or final fail for Tier 2 escalation.
 */
async function probeWithSelfHeal(
  baseUrl: string,
  spec: ProbeSpec,
  opts: { enableHeal: boolean },
): Promise<{ result: CheckResult; heal?: HealIncident; escalate?: EscalationRecord }> {
  const first = await probeEndpoint(baseUrl, spec);
  if (first.status === 'pass' || first.status === 'warn' || first.status === 'skip') {
    return { result: first };
  }

  const allowHeal = opts.enableHeal && (spec.selfHeal !== false) && isTransientProbeFailure(first);
  if (!allowHeal) {
    if (first.status === 'fail' && first.critical) {
      const endpoint = String(first.meta?.endpoint ?? spec.path);
      return {
        result: first,
        escalate: {
          timestamp: new Date().toISOString(),
          endpoint,
          checkId: spec.id,
          statusCode: metaStatus(first),
          responseBody: clipPayload(first.meta?.payload ?? first.detail, 1200),
          detail: first.detail,
          suspectedFiles: suspectedFilesFor(spec.id, endpoint),
          recoveryAttempted: ['(self-heal skipped — non-transient or --no-heal)'],
        },
      };
    }
    return { result: first };
  }

  const endpoint = String(first.meta?.endpoint ?? spec.path);
  const recoveryActions: string[] = [
    `initial: ${first.detail}`,
  ];
  let last = first;

  for (let attempt = 0; attempt < SELF_HEAL_ATTEMPTS; attempt++) {
    const backoff = SELF_HEAL_BACKOFF_MS[Math.min(attempt, SELF_HEAL_BACKOFF_MS.length - 1)];
    await sleep(backoff);
    recoveryActions.push(`backoff ${backoff}ms (attempt ${attempt + 1}/${SELF_HEAL_ATTEMPTS})`);

    // Re-warm health (DB path) then the failing route itself.
    recoveryActions.push(await rewarmRoute(baseUrl, '/api/health'));
    recoveryActions.push(await rewarmRoute(baseUrl, '/api/live'));
    recoveryActions.push(await rewarmRoute(baseUrl, spec.path));

    const supabase = await verifySupabaseConnectivity();
    recoveryActions.push(supabase.action);

    last = await probeEndpoint(baseUrl, spec);
    if (last.status === 'pass') {
      const heal: HealIncident = {
        timestamp: new Date().toISOString(),
        endpoint,
        checkId: spec.id,
        initialError: first.detail,
        initialStatus: metaStatus(first),
        recoveryActions,
        verifiedResult: `200 OK — ${last.detail}`,
      };
      await appendHealLog(heal).catch(() => undefined);
      return {
        result: {
          ...last,
          status: 'healed',
          detail: `AUTO-HEALED after ${attempt + 1} attempt(s): was "${first.detail}" → now ${last.detail}`,
          meta: {
            ...last.meta,
            healed: true,
            initialStatus: metaStatus(first),
            initialError: first.detail,
            recoveryActions,
          },
        },
        heal,
      };
    }
    recoveryActions.push(`reprobe still failing: ${last.detail}`);
  }

  const escalate: EscalationRecord = {
    timestamp: new Date().toISOString(),
    endpoint,
    checkId: spec.id,
    statusCode: metaStatus(last),
    responseBody: clipPayload(last.meta?.payload ?? last.detail, 1200),
    detail: last.detail,
    suspectedFiles: suspectedFilesFor(spec.id, endpoint),
    recoveryAttempted: recoveryActions,
  };

  return {
    result: {
      ...last,
      detail: `PERSISTENT after self-heal: ${last.detail}`,
      meta: {
        ...last.meta,
        healed: false,
        initialStatus: metaStatus(first),
        initialError: first.detail,
        recoveryActions,
        escalated: true,
      },
    },
    escalate,
  };
}

async function checkDatabase(prisma: PrismaClient): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
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

async function checkLiveApis(
  baseUrl: string,
  opts: { enableHeal: boolean },
): Promise<{ checks: CheckResult[]; heals: HealIncident[]; escalations: EscalationRecord[] }> {
  const out: CheckResult[] = [];
  const heals: HealIncident[] = [];
  const escalations: EscalationRecord[] = [];

  const pushProbe = async (spec: ProbeSpec) => {
    const { result, heal, escalate } = await probeWithSelfHeal(baseUrl, spec, opts);
    out.push(result);
    if (heal) heals.push(heal);
    if (escalate) escalations.push(escalate);
    return result;
  };

  const discover = await pushProbe({
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

  if (discover.status === 'pass' || discover.status === 'healed') {
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
    if (visible === 0) {
      escalations.push({
        timestamp: new Date().toISOString(),
        endpoint: '/api/characters?nsfw=false',
        checkId: 'discover_zero_cards',
        statusCode: 200,
        responseBody: '[]',
        detail: 'Discover returned an empty catalog array.',
        suspectedFiles: suspectedFilesFor('discover_zero_cards', '/api/characters'),
        recoveryAttempted: ['(catalog empty is a data/query bug — not a cold-start heal)'],
      });
    }
  } else if (discover.status === 'fail') {
    out.push({
      id: 'discover_zero_cards',
      status: 'fail',
      critical: true,
      detail: `Skipped card-count validation because Discover probe failed: ${discover.detail}`,
      meta: discover.meta,
    });
  }

  await pushProbe({
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
  });

  const health = out.find((c) => c.id === 'api_health');
  if (health) {
    out.push({
      ...health,
      id: 'profile_path',
      detail: health.detail.replace('/api/health', 'health/profile data path'),
    });
  }

  await pushProbe({
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
  });

  const probeUser = process.env.NEXUS_HEALTHCHECK_PROFILE_USER?.trim();
  if (probeUser) {
    try {
      const profilePath = `/u/${encodeURIComponent(probeUser)}`;
      const { value: res, ms } = await timed(() =>
        fetch(`${baseUrl}${profilePath}`, {
          headers: { 'User-Agent': 'NexusWatchdog/3.0' },
          redirect: 'manual',
          signal: AbortSignal.timeout(25_000),
        }),
      );
      const text = await res.text().catch(() => '');
      if (res.status >= 500 || TRANSIENT_HTTP.has(res.status)) {
        // Tier-1: rewarm + retry profile HTML once or twice
        const actions: string[] = [`initial HTTP ${res.status}`];
        let finalStatus = res.status;
        let finalText = text;
        let healed = false;
        if (opts.enableHeal) {
          for (let i = 0; i < SELF_HEAL_ATTEMPTS; i++) {
            const backoff = SELF_HEAL_BACKOFF_MS[Math.min(i, SELF_HEAL_BACKOFF_MS.length - 1)];
            await sleep(backoff);
            actions.push(`backoff ${backoff}ms`);
            actions.push(await rewarmRoute(baseUrl, profilePath));
            const retry = await fetch(`${baseUrl}${profilePath}`, {
              headers: { 'User-Agent': 'NexusWatchdog/3.0' },
              redirect: 'manual',
              signal: AbortSignal.timeout(25_000),
            });
            finalText = await retry.text().catch(() => '');
            finalStatus = retry.status;
            if (finalStatus < 500 && finalStatus !== 404) {
              healed = true;
              break;
            }
            if (finalStatus === 404 && i === SELF_HEAL_ATTEMPTS - 1) break;
            if (!TRANSIENT_HTTP.has(finalStatus) && finalStatus < 500) break;
          }
        }
        if (healed) {
          const heal: HealIncident = {
            timestamp: new Date().toISOString(),
            endpoint: profilePath,
            checkId: 'profile_page',
            initialError: `HTTP ${res.status}`,
            initialStatus: res.status,
            recoveryActions: actions,
            verifiedResult: `HTTP ${finalStatus}`,
          };
          heals.push(heal);
          await appendHealLog(heal).catch(() => undefined);
          out.push({
            id: 'profile_page',
            status: 'healed',
            critical: false,
            detail: `AUTO-HEALED profile page: was HTTP ${res.status} → now HTTP ${finalStatus}`,
            ms,
            meta: { endpoint: profilePath, status: finalStatus, healed: true },
          });
        } else if (finalStatus >= 500 || finalStatus === 404) {
          out.push({
            id: 'profile_page',
            status: 'fail',
            critical: finalStatus >= 500,
            detail: `PERSISTENT HTTP ${finalStatus} on ${profilePath} — payload: ${clipPayload(finalText)}`,
            ms,
            meta: { endpoint: profilePath, status: finalStatus, payload: clipPayload(finalText) },
          });
          if (finalStatus >= 500) {
            escalations.push({
              timestamp: new Date().toISOString(),
              endpoint: profilePath,
              checkId: 'profile_page',
              statusCode: finalStatus,
              responseBody: clipPayload(finalText, 1200),
              detail: `HTTP ${finalStatus} on profile page after self-heal`,
              suspectedFiles: suspectedFilesFor('profile_page', profilePath),
              recoveryAttempted: actions,
            });
          }
        }
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

  return { checks: out, heals, escalations };
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
          'User-Agent': 'NexusWatchdog/3.0',
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
    const mark =
      check.status === 'pass' ? 'PASS'
        : check.status === 'healed' ? 'HEALED'
          : check.status === 'warn' ? 'WARN'
            : check.status === 'skip' ? 'SKIP'
              : 'FAIL';
    const crit = check.critical && check.status === 'fail' ? ' [CRITICAL]' : '';
    const metaStatusStr = check.meta && 'status' in check.meta ? ` status=${String(check.meta.status)}` : '';
    const metaPath = check.meta && 'endpoint' in check.meta ? ` endpoint=${String(check.meta.endpoint)}` : '';
    console.log(`  [${mark}]${crit} ${check.id}: ${check.detail}${check.ms != null ? ` (${check.ms}ms)` : ''}${metaPath}${metaStatusStr}`);
  }
  if (report.heals?.length) {
    console.log(`  Auto-healed incidents: ${report.heals.length}`);
    for (const h of report.heals) {
      console.log(`    • ${h.timestamp} ${h.endpoint} initial=${h.initialStatus} → ${h.verifiedResult}`);
    }
  }
  if (report.escalations?.length) {
    console.log(`  Tier-2 escalations: ${report.escalations.length} (see ${escalationPath()})`);
  }
  if (report.sms) {
    console.log(`  SMS: sent=${report.sms.sent} skipped=${report.sms.skipped} reason=${report.sms.reason}`);
  }
  if (report.cursorPrompt) {
    console.log('\n========== READY-TO-PASTE CURSOR PROMPT ==========');
    console.log(report.cursorPrompt);
    console.log('========== END CURSOR PROMPT ==========');
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
  const heals: HealIncident[] = [];
  const escalations: EscalationRecord[] = [];
  const baseUrl = siteBaseUrl();
  const enableHeal = !args.noHeal;

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
      const live = await checkLiveApis(baseUrl, { enableHeal });
      checks.push(...live.checks);
      heals.push(...live.heals);
      escalations.push(...live.escalations);
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

  // DB critical failures also escalate (no code mutation).
  for (const c of checks) {
    if (c.critical && c.status === 'fail' && !escalations.some((e) => e.checkId === c.id)) {
      if (c.id === 'database' || c.id === 'card_count_drop' || c.id === 'supabase_rest') {
        escalations.push({
          timestamp: new Date().toISOString(),
          endpoint: String(c.meta?.endpoint ?? c.id),
          checkId: c.id,
          statusCode: metaStatus(c),
          responseBody: clipPayload(c.meta?.payload ?? c.detail, 1200),
          detail: c.detail,
          suspectedFiles: suspectedFilesFor(c.id, String(c.meta?.endpoint ?? '')),
          recoveryAttempted: ['(DB/Supabase check — not an HTTP route heal)'],
        });
      }
    }
  }

  const alertable = checks.filter((c) => c.critical && c.status === 'fail');
  const healthyStatuses: CheckStatus[] = ['pass', 'skip', 'warn', 'healed'];
  let cursorPrompt: string | undefined;

  if (escalations.length > 0) {
    cursorPrompt = buildCursorPrompt(escalations);
    const file = await writeEscalationFile(escalations, cursorPrompt);
    console.log(`Wrote Tier-2 escalation: ${file}`);
  }

  const report: Report = {
    ok: checks.every((c) => healthyStatuses.includes(c.status)),
    critical: alertable.length > 0,
    time: new Date().toISOString(),
    baseUrl,
    checks,
    heals: heals.length ? heals : undefined,
    escalations: escalations.length ? escalations : undefined,
    cursorPrompt,
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
      summary: `Tier2 escalate: ${summary}`,
      detail: `checks=${alertable.map((c) => c.id).join(',')} escalation=${escalationPath()}`,
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
