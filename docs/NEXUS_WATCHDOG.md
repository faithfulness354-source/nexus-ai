# Nexus AI Watchdog

Two-tier self-healing monitor for Discover, profile/server health, Supabase, and card-count sanity — with optional SMS alerts for **persistent critical** failures only.

## Tiers

### Tier 1 — Autonomous self-healing (non-critical / transient runtime)

On schedule and after deployments, the watchdog probes live Discover + core API routes. If a route returns a **transient** HTTP `404`, `500`, `502`, `503`, `504`, or **timeout**, it automatically:

1. Retries with exponential backoff (`1s → 2s → 4s`, up to 3 attempts)
2. Re-warms `/api/health`, `/api/live`, and the failing route (cache-bust GET)
3. Verifies Supabase REST connectivity
4. Re-probes the endpoint

Successful recoveries are logged to `nextjs_space/data/watchdog-heal-log.jsonl` with timestamp, endpoint, initial error, recovery actions, and verified `200 OK`. Human output marks them `[HEALED]` (exit 0 — no SMS).

### Tier 2 — Persistent / critical escalation (no blind repo edits)

If the endpoint still returns HTTP 404/500 (or malformed JSON / empty Discover) after self-heal retries, the watchdog **does not** mutate source files or push commits to `main`.

Instead it:

1. Writes full error details to repo-root `watchdog-escalation.md` (endpoint, status, body, suspected `nextjs_space` files, recovery log)
2. Prints a **ready-to-paste Cursor prompt** to stdout (also embedded in the markdown)
3. Sends a critical SMS (when configured) so you can fix it safely in your local worktree

## What it checks (non-destructive)

| Check | Critical? | Notes |
| --- | --- | --- |
| Database ping | Yes | `SELECT 1` via Prisma |
| Card counts | No (info) | total / public / SFW public / NSFW public |
| Card integrity | No | Empty-name scan only — **no writes** |
| Public card count drop | Yes if ≥50% drop and ≥5 cards vs baseline | Requires `--update-baseline` once |
| `GET /api/characters` (Discover) | Yes | Fail on 5xx / timeout / non-array; **0 cards** is critical |
| `GET /api/health` | Yes | Proxy for server/data-path health |
| `GET /api/live` | Yes | Live revision stamp |
| Supabase REST | Yes when configured | Reachability of `{SUPABASE_URL}/rest/v1/` |
| `GET /u/{user}` | Optional | Set `NEXUS_HEALTHCHECK_PROFILE_USER` |

The watchdog **never**:

- Deletes, truncates, or bulk-updates character rows
- Runs unreviewed schema migrations
- Mutates application source or pushes blind commits on Tier-2 failures
- Starts full unbatched image / fal generation runs
- Disables SFW/NSFW classification or multi-signal underage gating

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

# Skip Tier-1 self-heal (probe once, escalate immediately on fail)
npx tsx --require dotenv/config src/scripts/nexus-healthcheck.ts --no-heal

# Record current public/SFW counts as the drop baseline (safe)
npx tsx --require dotenv/config src/scripts/nexus-healthcheck.ts --update-baseline

# Safe SMS test
npx tsx --require dotenv/config src/scripts/nexus-healthcheck.ts --sms-test
```

npm alias:

```bash
npm run watchdog
npm run watchdog:dry
npm run watchdog:sms-test
```

## Active live probes

| Probe | Path | Critical when |
| --- | --- | --- |
| Discover catalog | `GET /api/characters?nsfw=false` | Persistent HTTP 5xx/404/timeout/non-array after heal |
| Empty catalog | (same response) | HTTP 200 with `[]` |
| Health / DB path | `GET /api/health` | Persistent 5xx/timeout/bad JSON / `status: down` |
| Live revision | `GET /api/live` | Persistent 5xx/timeout / missing `ok: true` |
| Supabase REST | `GET {SUPABASE_URL}/rest/v1/` | HTTP 500 / timeout when URL + anon key are set |
| Profile page | `GET /u/{user}` | Persistent HTTP 500 / timeout (optional) |

## Cron / GitHub Actions

- Workflow: `.github/workflows/nexus-watchdog.yml`
  - every **15 minutes**
  - on every **push to `main`** (post-deploy settle ~45s, then probe)
  - on successful **deployment_status** (Vercel Production)
  - manual `workflow_dispatch`
- Uploads `watchdog-escalation.md` as a CI artifact when Tier-2 fires
- When secrets are missing, checks **skip** (exit 0) instead of failing like a Vercel build break

### Secrets to configure

| Name | Where | Required for |
| --- | --- | --- |
| `DATABASE_URL` | GitHub Actions secrets | DB ping + card counts |
| `DIRECT_URL` | GitHub Actions (optional) | Prisma generate / direct DB |
| `NEXUS_HEALTHCHECK_BASE_URL` | GitHub Actions | Live Discover/health/live HTTP probes |
| `NEXT_PUBLIC_SITE_URL` | GitHub Actions **and** Vercel | Fallback base URL |
| `NEXT_PUBLIC_SUPABASE_URL` | GitHub Actions (optional) | Direct Supabase REST + heal verification |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | GitHub Actions (optional) | Direct Supabase REST + heal verification |
| `NEXUS_HEALTHCHECK_PROFILE_USER` | GitHub Actions (optional) | `/u/{user}` probe |
| Twilio / `ALERT_*` | GitHub Actions | SMS on Tier-2 critical |

## When SMS fires

SMS is sent only when at least one **critical** check remains **failed after Tier-1 self-heal** (or is non-healable), including:

- Database unreachable
- Discover catalog still failing / zero cards
- `/api/health` or `/api/live` still failing
- Supabase REST HTTP 500 / timeout (when configured)
- Unexpected public card count collapse vs baseline

Auto-healed incidents do **not** SMS.

## Manual-only (do not automate)

- Destructive DB writes / mass deletes
- Blind source mutations / unreviewed pushes on Tier-2 failures
- Unreviewed `ALTER` / Prisma schema deploys
- Full unbatched portrait/scene image generation for the entire catalog
- Changing SFW↔NSFW policy thresholds without review

## Related code

- `src/scripts/nexus-healthcheck.ts` — two-tier checker
- `lib/notify-sms.ts` — Twilio/webhook + cooldown
- `watchdog-escalation.md` — Tier-2 report (gitignored, generated at runtime)
- `data/watchdog-heal-log.jsonl` — Tier-1 heal audit trail (gitignored)
