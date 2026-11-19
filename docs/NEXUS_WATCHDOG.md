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

## Cron / GitHub Actions

- Workflow: `.github/workflows/nexus-watchdog.yml` (scheduled + manual `workflow_dispatch`).
- Required Actions secrets: `DATABASE_URL`, `NEXUS_HEALTHCHECK_BASE_URL` (or `NEXT_PUBLIC_SITE_URL`), and Twilio/`ALERT_*` when you want live SMS.
- Cooldown file is ephemeral on Actions runners; fingerprint cooldown still limits bursts within a single job, and Twilio-side rate limits apply. For durable cooldown across runs, point `ALERT_SMS_COOLDOWN_FILE` at a persisted volume or use a longer `ALERT_SMS_COOLDOWN_MINUTES`.

Local cron example (every 15 minutes):

```cron
*/15 * * * * cd /path/to/nexus-ai/nextjs_space && /usr/bin/npx tsx --require dotenv/config src/scripts/nexus-healthcheck.ts >> /var/log/nexus-watchdog.log 2>&1
```

## When SMS fires

SMS is sent only when at least one **critical** check fails, including:

- Database unreachable
- Discover API 5xx / non-array payload
- Discover returns **zero** cards
- Health/profile data path 5xx or `status: down`
- Unexpected public card count collapse vs baseline

Each alert includes failure summary + UTC timestamp. Identical critical sets share a fingerprint and are suppressed for `ALERT_SMS_COOLDOWN_MINUTES` (default 60).

## Manual-only (do not automate)

- Destructive DB writes / mass deletes
- Unreviewed `ALTER` / Prisma schema deploys beyond the additive VLM heal already in app code
- Full unbatched portrait/scene image generation for the entire catalog
- Changing SFW↔NSFW policy thresholds without review

## Related code

- `src/scripts/nexus-healthcheck.ts` — checker
- `src/lib/notify-sms.ts` — Twilio/webhook + cooldown
- `lib/content-rating.ts` — SFW/NSFW rules (unchanged by watchdog)
- `lib/vision/image-moderation.ts` — multi-signal underage gate (unchanged)
