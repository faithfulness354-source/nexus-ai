# KidVerse AI

COPPA-compliant, parent-managed multi-realm launcher for kid-safe AI adventures.

**Greenfield only** — this app does not connect to or reuse any adult roleplay databases, prompts, or codebases.

## Realms

| Age tier | Realm | Focus |
| --- | --- | --- |
| `ages_5_7` | **StorySprout** | Voice-first picture adventure, auto TTS, giant mic, icon choices |
| `ages_8_9` | **RealmHopper** | Quests, riddles, backpack, Build-a-Hero |
| `ages_10_12` | **FableForge** | Middle-grade RPG, stats/gear, quest log, world-builder |

## Preview (Expo)

```bash
cd kidverse-ai
npm install
npx expo start
```

Demo kid profiles are pre-seeded (one per Realm). Parent Gate demo PIN: `1234`.

Without Supabase env vars, gameplay uses the local mock turn engine so you can preview immediately.

## Supabase

1. Apply `supabase/migrations/001_kidverse_schema.sql`
2. Deploy `supabase/functions/realm-turn`
3. Copy `.env.example` → `.env` and set `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
4. Optionally set Edge secret `OPENAI_API_KEY` for live LLM turns

## Safety pipeline

Every server turn: Pre-LLM filter → non-overridable age-calibrated G-rated system prompt → structured JSON → post-LLM validation.
