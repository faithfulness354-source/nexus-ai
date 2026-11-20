/**
 * Nexus AI watchdog health & sanity check.
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

const CRITICAL_IDS = new Set([
  'database',
  'discover_api',
  'discover_zero_cards',
  'profile_path',
  'card_count_drop',
]);

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

async function timed<T>(run: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = Date.now();
  const value = await run();
  return { value, ms: Date.now() - started };
}

async function checkDatabase(prisma: PrismaClient): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  // Empty / missing DATABASE_URL is a CI configuration gap, not a live outage.
  // Fail soft so scheduled runs without secrets do not look like a production build break.
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

    // Integrity: empty names only (non-destructive SELECT).
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
  // Critical if public catalog drops by ≥50% and by at least 5 cards.
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

async function checkHttp(baseUrl: string): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const headers = { Accept: 'application/json', 'User-Agent': 'NexusWatchdog/1.0' };

  // Discover listing
  try {
    const { value: res, ms } = await timed(() =>
      fetch(`${baseUrl}/api/characters`, { headers, redirect: 'manual', signal: AbortSignal.timeout(20_000) }),
    );
    if (res.status >= 500) {
      out.push({
        id: 'discover_api',
        status: 'fail',
        critical: true,
        detail: `Discover API HTTP ${res.status}`,
        ms,
      });
    } else if (res.status >= 300 && res.status < 400) {
      out.push({
        id: 'discover_api',
        status: 'warn',
        critical: false,
        detail: `Discover API redirected (${res.status}) — auth wall or CDN. Body not checked.`,
        ms,
      });
    } else {
      const body = await res.json().catch(() => null);
      const list = Array.isArray(body) ? body : null;
      if (!list) {
        out.push({
          id: 'discover_api',
          status: 'fail',
          critical: true,
          detail: `Discover API returned non-array body (HTTP ${res.status}).`,
          ms,
          meta: { bodyType: body && typeof body === 'object' ? Object.keys(body).slice(0, 5) : typeof body },
        });
      } else {
        out.push({
          id: 'discover_api',
          status: 'pass',
          critical: true,
          detail: `Discover API ok — ${list.length} cards visible.`,
          ms,
          meta: { visible: list.length },
        });
        if (list.length === 0) {
          out.push({
            id: 'discover_zero_cards',
            status: 'fail',
            critical: true,
            detail: 'Discover returned 0 cards while the endpoint responded 200.',
            ms,
          });
        } else {
          out.push({
            id: 'discover_zero_cards',
            status: 'pass',
            critical: true,
            detail: `Discover has ${list.length} card(s).`,
          });
        }
      }
    }
  } catch (err) {
    out.push({
      id: 'discover_api',
      status: 'fail',
      critical: true,
      detail: err instanceof Error ? err.message : 'Discover fetch failed.',
    });
  }

  // Health endpoint (profile/server data path proxy — always public)
  try {
    const { value: res, ms } = await timed(() =>
      fetch(`${baseUrl}/api/health`, { headers, redirect: 'manual', signal: AbortSignal.timeout(20_000) }),
    );
    if (res.status >= 500) {
      out.push({
        id: 'profile_path',
        status: 'fail',
        critical: true,
        detail: `Health/profile data path HTTP ${res.status}`,
        ms,
      });
    } else if (res.status >= 300 && res.status < 400) {
      out.push({
        id: 'profile_path',
        status: 'warn',
        critical: false,
        detail: `Health endpoint redirected (${res.status}).`,
        ms,
      });
    } else {
      const body = await res.json().catch(() => null) as { status?: string; db?: string } | null;
      const down = body?.status === 'down' || body?.db === 'unavailable' || res.status >= 500;
      out.push({
        id: 'profile_path',
        status: down ? 'fail' : 'pass',
        critical: true,
        detail: down
          ? `Health reports down (${JSON.stringify(body).slice(0, 160)})`
          : `Health ok (HTTP ${res.status}).`,
        ms,
        meta: body ?? undefined,
      });
    }
  } catch (err) {
    out.push({
      id: 'profile_path',
      status: 'fail',
      critical: true,
      detail: err instanceof Error ? err.message : 'Health fetch failed.',
    });
  }

  // Optional known profile username probe (HTML/RSC — 5xx only)
  const probeUser = process.env.NEXUS_HEALTHCHECK_PROFILE_USER?.trim();
  if (probeUser) {
    try {
      const { value: res, ms } = await timed(() =>
        fetch(`${baseUrl}/u/${encodeURIComponent(probeUser)}`, {
          headers: { 'User-Agent': 'NexusWatchdog/1.0' },
          redirect: 'manual',
          signal: AbortSignal.timeout(25_000),
        }),
      );
      if (res.status >= 500) {
        out.push({
          id: 'profile_page',
          status: 'fail',
          critical: true,
          detail: `Profile /u/${probeUser} HTTP ${res.status}`,
          ms,
        });
      } else {
        out.push({
          id: 'profile_page',
          status: res.status === 404 ? 'warn' : 'pass',
          critical: false,
          detail: `Profile /u/${probeUser} HTTP ${res.status}`,
          ms,
        });
      }
    } catch (err) {
      out.push({
        id: 'profile_page',
        status: 'fail',
        critical: true,
        detail: err instanceof Error ? err.message : 'Profile page fetch failed.',
      });
    }
  }

  return out;
}

function printHuman(report: Report): void {
  console.log(`Nexus watchdog @ ${report.time}`);
  console.log(`baseUrl=${report.baseUrl ?? '(none — DB checks only)'}`);
  for (const check of report.checks) {
    const mark = check.status === 'pass' ? 'PASS' : check.status === 'warn' ? 'WARN' : check.status === 'skip' ? 'SKIP' : 'FAIL';
    const crit = check.critical && check.status === 'fail' ? ' [CRITICAL]' : '';
    console.log(`  [${mark}]${crit} ${check.id}: ${check.detail}${check.ms != null ? ` (${check.ms}ms)` : ''}`);
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

    if (baseUrl) {
      checks.push(...await checkHttp(baseUrl));
    } else {
      checks.push({
        id: 'discover_api',
        status: 'skip',
        critical: false,
        detail: 'Set NEXUS_HEALTHCHECK_BASE_URL or NEXT_PUBLIC_SITE_URL (GitHub secret / Vercel env) to probe HTTP endpoints.',
      });
      checks.push({
        id: 'profile_path',
        status: 'skip',
        critical: false,
        detail: 'HTTP base URL not configured — skipping live Discover/health probes.',
      });
    }
  } finally {
    await prisma.$disconnect();
  }

  const criticalFails = checks.filter((c) => c.critical && c.status === 'fail' && CRITICAL_IDS.has(c.id));
  // Also treat any critical:true fail as alertable even if id set evolves.
  const alertable = checks.filter((c) => c.critical && c.status === 'fail');
  const report: Report = {
    ok: checks.every((c) => c.status === 'pass' || c.status === 'skip' || c.status === 'warn'),
    critical: alertable.length > 0,
    time: new Date().toISOString(),
    baseUrl,
    checks,
  };

  if (report.critical && !args.dryRun) {
    const summary = alertable.map((c) => `${c.id}: ${c.detail}`).join(' | ').slice(0, 400);
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
