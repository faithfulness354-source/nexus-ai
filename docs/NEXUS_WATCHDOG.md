# Nexus AI Watchdog

Practical monitoring for Discover, profile/server health, and card-count sanity — with optional SMS alerts for **critical** failures only.

## What it checks (non-destructive)

| Check | Critical? | Notes |
| --- | --- | --- |
| Database ping | Yes | `SELECT 1` via Prisma |
| Card counts | No (info) | total / public / SFW public / NSFW public |
| Card integrity | No | Empty-name scan only — **no writes** |
| Public card count drop | Yes if ≥50% drop and ≥5 cards vs baseline | Requires `--update-baseline` once |
| `GET /api/characters` (Discover) | Yes | Fail on 5xx or non-array body; **0 cards** is critical |
| `GET /api/health` | Yes | Proxy for server/data-path health (profile stack) |
| `GET /u/{user}` | Optional | Set `NEXUS_HEALTHCHECK_PROFILE_USER` |

The watchdog **never**:

- Deletes, truncates, or bulk-updates character rows
- Runs unreviewed schema migrations
- Starts full unbatched image / fal generation runs
- Disables SFW/NSFW classification, multi-signal underage gating, or the SFW violation message:  
  **“This falls under NSFW content and cannot be applied to SFW fields.”**

Those remain manual / gated operator actions.

## Setup

1. **App URL** (required for HTTP probes):

```bash
NEXUS_HEALTHCHECK_BASE_URL=https://your-production-domain.example
# or
NEXT_PUBLIC_SITE_URL=https://your-production-domain.example
```

2. **Database** (same as the app):

```bash
DATABASE_URL=...
DIRECT_URL=...   # optional
```

3. **SMS (Twilio)** — optional until you are ready:

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_FROM_NUMBER=+1xxxxxxxxxx
ALERT_TO_PHONE_NUMBER=+1xxxxxxxxxx
# optional
ALERT_SMS_COOLDOWN_MINUTES=60
ALERT_SMS_COOLDOWN_FILE=./data/watchdog-sms-cooldown.json
```

Alternate: set `ALERT_SMS_WEBHOOK_URL` to a POST endpoint that accepts `{ text, fingerprint, source, sentAt }` instead of Twilio.

Phone numbers are **never** printed in full in logs (last-4 mask only).

4. **Optional profile probe**:

```bash
NEXUS_HEALTHCHECK_PROFILE_USER=nexusai
```

## Commands

From `nextjs_space`:

```bash
# Local / CI check (exit 1 on critical)
npx tsx --require dotenv/config src/scripts/nexus-healthcheck.ts

# Machine-readable
npx tsx --require dotenv/config src/scripts/nexus-healthcheck.ts --json

# Probe without sending SMS
npx tsx --require dotenv/config src/scripts/nexus-healthcheck.ts --dry-run

# Record current public/SFW counts as the drop baseline (safe)
npx tsx --require dotenv/config src/scripts/nexus-healthcheck.ts --update-baseline

# Safe SMS test (uses fingerprint watchdog-test; respects provider config)
npx tsx --require dotenv/config src/scripts/nexus-healthcheck.ts --sms-test
```

npm alias:

```bash
npm run watchdog
npm run watchdog:dry
npm run watchdog:sms-test
```

## Active live probes (not homepage HTML)

Each run hits the **database** plus these live routes when a base URL is configured:

| Probe | Path | Critical when |
| --- | --- | --- |
| Discover catalog | `GET /api/characters?nsfw=false` | HTTP 500, timeout, non-200, or non-array JSON |
| Empty catalog | (same response) | HTTP 200 with `[]` |
| Health / DB path | `GET /api/health` | HTTP 500, timeout, malformed JSON, or `status: down` |
| Live revision | `GET /api/live` | HTTP 500, timeout, or missing `ok: true` |
| Supabase REST | `GET {SUPABASE_URL}/rest/v1/` | HTTP 500 / timeout when URL + anon key are set |
| Profile page | `GET /u/{user}` | HTTP 500 / timeout (optional) |

Failures log **HTTP status**, **endpoint path**, and a clipped **response payload** into the check detail + SMS summary.

## Cron / GitHub Actions

- Workflow: `.github/workflows/nexus-watchdog.yml`
  - every **15 minutes**
  - on every **push to `main`** (post-deploy settle ~45s, then probe)
  - on successful **deployment_status** (Vercel Production)
  - manual `workflow_dispatch`
- When secrets are missing, checks **skip** (exit 0) instead of failing like a Vercel build break.
- Cooldown file is ephemeral on Actions runners; fingerprint cooldown still limits bursts within a single job, and Twilio-side rate limits apply. For durable cooldown across runs, point `ALERT_SMS_COOLDOWN_FILE` at a persisted volume or use a longer `ALERT_SMS_COOLDOWN_MINUTES`.

### Secrets to configure

| Name | Where | Required for |
| --- | --- | --- |
| `DATABASE_URL` | **GitHub Actions** secrets (watchdog job) | DB ping + card counts |
| `DIRECT_URL` | GitHub Actions (optional) | Prisma generate / direct DB |
| `NEXUS_HEALTHCHECK_BASE_URL` | GitHub Actions | Live Discover/health/live HTTP probes |
| `NEXT_PUBLIC_SITE_URL` | GitHub Actions **and** Vercel (app already uses it) | Fallback base URL for probes; public site links |
| `NEXT_PUBLIC_SUPABASE_URL` | GitHub Actions (optional) | Direct Supabase REST reachability probe |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | GitHub Actions (optional) | Direct Supabase REST reachability probe |
| `NEXUS_HEALTHCHECK_PROFILE_USER` | GitHub Actions (optional) | `/u/{user}` probe |
| `TWILIO_ACCOUNT_SID` | GitHub Actions | SMS via Twilio |
| `TWILIO_AUTH_TOKEN` | GitHub Actions | SMS via Twilio |
| `TWILIO_FROM_NUMBER` | GitHub Actions | SMS via Twilio |
| `ALERT_TO_PHONE_NUMBER` | GitHub Actions | SMS destination |
| `ALERT_SMS_WEBHOOK_URL` | GitHub Actions (optional alt to Twilio) | Webhook SMS |
| `ALERT_SMS_COOLDOWN_MINUTES` | GitHub Actions (optional, default 60) | Dedup window |
| `NEXT_PUBLIC_SUBSCRIBESTAR_PROFILE_URL` | **Vercel** (app build/runtime) | SubscribeStar outbound links — **not** required for watchdog |

SMS/watchdog vars are **not** required in Vercel for `npm run build` / production Next.js. They belong in **GitHub Actions secrets** for the scheduled watchdog. Keep `NEXT_PUBLIC_SITE_URL` (and billing URLs) in Vercel as usual.

Local cron example (every 15 minutes):

```cron
*/15 * * * * cd /path/to/nexus-ai/nextjs_space && /usr/bin/npx tsx --require dotenv/config src/scripts/nexus-healthcheck.ts >> /var/log/nexus-watchdog.log 2>&1
```

## When SMS fires

SMS is sent only when at least one **critical** check fails, including:

- Database unreachable
- Discover catalog HTTP 500 / timeout / non-200 / malformed JSON
- Discover returns **zero** cards
- `/api/health` or `/api/live` HTTP 500 / timeout / bad JSON
- Supabase REST HTTP 500 / timeout (when configured)
- Unexpected public card count collapse vs baseline

Alert text includes endpoint path, HTTP status (or `timeout`), and a clipped error payload.

Each alert includes failure summary + UTC timestamp. Identical critical sets share a fingerprint and are suppressed for `ALERT_SMS_COOLDOWN_MINUTES` (default 60).

## Manual-only (do not automate)

- Destructive DB writes / mass deletes
- Unreviewed `ALTER` / Prisma schema deploys beyond the additive VLM heal already in app code
- Full unbatched portrait/scene image generation for the entire catalog
- Changing SFW↔NSFW policy thresholds without review

## Related code

- `src/scripts/nexus-healthcheck.ts` — checker (excluded from Next `tsc` / Vercel app typecheck)
- `lib/notify-sms.ts` — Twilio/webhook + cooldown (`src/lib/notify-sms.ts` re-exports)
- `lib/content-rating.ts` — SFW/NSFW rules (unchanged by watchdog)
- `lib/vision/image-moderation.ts` — multi-signal underage gate (unchanged)
