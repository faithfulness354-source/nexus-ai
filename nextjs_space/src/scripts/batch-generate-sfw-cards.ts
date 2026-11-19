/**
 * Generate / upsert 50 rich SFW character cards across:
 * slice_of_life, academy_life, fantasy_academy_life, swords_and_sorcery, isekai, cyberpunk.
 *
 * From nextjs_space:
 *   npx tsx --require dotenv/config src/scripts/batch-generate-sfw-cards.ts --check
 *   npx tsx --require dotenv/config src/scripts/batch-generate-sfw-cards.ts --from 1 --to 10
 *   npx tsx --require dotenv/config src/scripts/batch-generate-sfw-cards.ts --batch-size 5 --from 1
 *   npx tsx --require dotenv/config src/scripts/batch-generate-sfw-cards.ts --text-only
 *   npx tsx --require dotenv/config src/scripts/batch-generate-sfw-cards.ts --skip-cloud
 *
 * Upserts by stable id `nexus-sfw-NNN` (Prisma + optional Supabase onConflict local_id).
 * Never deletes other characters. Images prefer fal.ai flux-2; ComfyUI is offline fallback.
 */
import 'dotenv/config';
import { createHash } from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
import { fal } from '@fal-ai/client';
import {
  SFW_BATCH_CARDS,
  assertSfwBatchRoster,
  sfwBatchCreatorNotes,
  sfwBatchExampleDialogue,
  sfwBatchSystemPrompt,
  type SfwBatchCard,
} from '../config/sfw-batch-roster';
import { SFW_CARD_NEGATIVE, SFW_BATCH_GENRE_LABEL } from '../config/sfw-batch-genres';
import { customRulesJson } from '../config/card-pipeline';
import { rateCharacterContent, isPlayStoreSafe } from '../../lib/content-rating';
import { generateComfyImage } from '../lib/comfy/client';

const NEXUS_USERNAME = 'nexusai';
const NEXUS_EMAIL = 'nexusai@localhost';
const NEXUS_DISPLAY = 'Nexus AI';
const DELAY_MS = 2500;
const FAL_TEXT_MODEL = 'fal-ai/flux-2';

type Args = {
  check: boolean;
  textOnly: boolean;
  skipCloud: boolean;
  from: number;
  to: number;
  batchSize: number;
};

function parseArgs(argv: string[]): Args {
  const getNum = (flag: string, fallback: number) => {
    const i = argv.indexOf(flag);
    if (i < 0) return fallback;
    const n = Number(argv[i + 1]);
    return Number.isFinite(n) ? n : fallback;
  };
  const from = Math.max(1, getNum('--from', 1));
  const batchSize = Math.max(1, getNum('--batch-size', 50));
  const toFlag = argv.includes('--to') ? getNum('--to', 50) : Math.min(50, from + batchSize - 1);
  return {
    check: argv.includes('--check'),
    textOnly: argv.includes('--text-only'),
    skipCloud: argv.includes('--skip-cloud'),
    from,
    to: Math.min(50, Math.max(from, toFlag)),
    batchSize,
  };
}

function appRoot(): string {
  const here = process.cwd();
  if (fs.existsSync(path.join(here, 'src', 'config', 'sfw-batch-roster.ts'))) return here;
  const nested = path.join(here, 'nextjs_space');
  if (fs.existsSync(path.join(nested, 'src', 'config', 'sfw-batch-roster.ts'))) return nested;
  return here;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashUserId(userId: string): string {
  return createHash('sha256').update(String(userId)).digest('hex');
}

function assertCardSafe(card: SfwBatchCard): void {
  const rating = rateCharacterContent({
    name: card.name,
    title: card.title,
    summary: card.bio,
    personality: card.personality,
    scenario: card.scenario,
    initialMessage: card.greeting,
    exampleDialogue: sfwBatchExampleDialogue(card),
    creatorNotes: sfwBatchCreatorNotes(card),
    systemPrompt: sfwBatchSystemPrompt(card),
    tags: card.tags,
    attire: card.attire,
  });
  if (rating.isNsfw) {
    throw new Error(`SFW batch card ${card.name} failed content rating: ${rating.reasons.join('; ')}`);
  }
  // Attire + card text only (image_prompt is positive clothing language, not rated as lore text).
  if (!isPlayStoreSafe(card.bio, card.personality, card.scenario, card.greeting, card.attire)) {
    throw new Error(`SFW batch card ${card.name} failed playStoreSafe attire/text checks`);
  }
}

async function nexusSystemUserId(prisma: PrismaClient): Promise<{ id: string; email: string }> {
  const profile = { username: NEXUS_USERNAME, displayName: NEXUS_DISPLAY, name: NEXUS_DISPLAY };
  const existing = await prisma.user.findUnique({ where: { email: NEXUS_EMAIL }, select: { id: true, email: true } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: profile });
    return { id: existing.id, email: NEXUS_EMAIL };
  }
  const created = await prisma.user.create({
    data: {
      email: NEXUS_EMAIL,
      ...profile,
      bio: 'Platform profile for Nexus AI character cards.',
      termsAcceptedAt: new Date(),
      termsAccepted: true,
    },
    select: { id: true, email: true },
  });
  return { id: created.id, email: created.email };
}

async function generateFalPortrait(prompt: string, userHash: string): Promise<string> {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw new Error('FAL_KEY is not configured');
  fal.config({ credentials: key });
  const result = await fal.subscribe(FAL_TEXT_MODEL, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: {
      prompt: `${prompt}. Negative cues to avoid: ${SFW_CARD_NEGATIVE}`,
      guidance_scale: 3.5,
      num_inference_steps: 28,
      image_size: { width: 1024, height: 1024 },
      num_images: 1,
      enable_safety_checker: true,
      output_format: 'png',
      user: userHash.slice(0, 256),
    } as any,
    logs: false,
  });
  const url = (result.data as { images?: Array<{ url?: string }> })?.images?.[0]?.url;
  if (!url) throw new Error('fal.ai returned no image');
  return url;
}

async function persistLocalAvatar(opts: {
  remoteUrl: string;
  stem: string;
  picturesDir: string;
}): Promise<string> {
  const dir = path.join(opts.picturesDir, 'sfw');
  await fsp.mkdir(dir, { recursive: true });
  const res = await fetch(opts.remoteUrl, { signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`Failed to download portrait (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const file = `${opts.stem}.png`;
  await fsp.writeFile(path.join(dir, file), buf);
  const publicDir = path.join(process.cwd(), 'public', 'nexus_assets', 'images', 'sfw');
  await fsp.mkdir(publicDir, { recursive: true });
  await fsp.copyFile(path.join(dir, file), path.join(publicDir, file)).catch(() => {});
  return `/nexus_assets/images/sfw/${file}`;
}

async function upsertSupabaseCharacter(opts: {
  character: {
    id: string;
    name: string;
    title: string;
    summary: string;
    personality: string;
    scenario: string;
    initialMessage: string;
    tags: string;
    avatar: string | null;
    nsfw: boolean;
    visibility: string;
  };
  ownerEmail: string;
  ownerLocalId: string;
}): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.warn('  Supabase not configured — skipping cloud upsert');
    return;
  }
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Ensure cloud user row exists (id = local owner when possible).
  await admin.from('profiles').upsert({ id: opts.ownerLocalId }, { onConflict: 'id' });

  const row = {
    local_id: opts.character.id,
    user_id: opts.ownerLocalId,
    name: opts.character.name,
    title: opts.character.title,
    summary: opts.character.summary,
    personality: opts.character.personality,
    scenario: opts.character.scenario,
    greeting: opts.character.initialMessage,
    tags: opts.character.tags,
    avatar: opts.character.avatar,
    nsfw: false,
    visibility: opts.character.visibility,
    updated_at: new Date().toISOString(),
  };

  const first = await admin.from('characters').upsert(row, { onConflict: 'local_id' }).select('local_id,summary,personality,scenario,greeting');
  if (first.error) throw new Error(`Supabase characters upsert failed: ${first.error.message}`);
  const stored = first.data?.[0];
  if (!stored || stored.summary !== row.summary || stored.greeting !== row.greeting) {
    throw new Error('Supabase did not confirm the SFW card static fields');
  }

  const scenarioWrite = await admin.from('scenarios').upsert({
    local_id: `${opts.character.id}:scenario`,
    user_id: opts.ownerLocalId,
    character_local_id: opts.character.id,
    title: opts.character.name,
    body: opts.character.scenario,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'local_id' });
  if (scenarioWrite.error) throw new Error(`Supabase scenarios upsert failed: ${scenarioWrite.error.message}`);
}

function buildCharacterData(card: SfwBatchCard, avatar: string | null, ownerId: string) {
  const tags = `${card.tags}, ${SFW_BATCH_GENRE_LABEL[card.genre]}`;
  return {
    name: card.name,
    title: card.title,
    summary: `${card.profile_summary}\n\n${card.bio}`,
    personality: `${card.personality}\n\nSayings:\n- ${card.sayings.join('\n- ')}`,
    scenario: card.scenario,
    initialMessage: card.greeting,
    exampleDialogue: sfwBatchExampleDialogue(card),
    customRules: customRulesJson(
      card.genre === 'cyberpunk' ? 'cyberpunk'
        : card.genre === 'isekai' ? 'isekai'
          : card.genre === 'slice_of_life' || card.genre === 'academy_life' ? 'cozy'
            : 'high-fantasy',
      false,
    ),
    systemPrompt: sfwBatchSystemPrompt(card),
    creatorNotes: sfwBatchCreatorNotes(card),
    tags,
    avatar,
    nsfw: false,
    creator: NEXUS_DISPLAY,
    ownerId,
    visibility: 'PUBLIC' as const,
    moderated: false,
  };
}

async function renderAvatar(card: SfwBatchCard, ownerId: string, picturesDir: string): Promise<string | null> {
  const stem = `${String(card.batchIndex).padStart(3, '0')}-${card.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  if (process.env.FAL_KEY?.trim()) {
    const remote = await generateFalPortrait(card.image_prompt, hashUserId(ownerId));
    try {
      return await persistLocalAvatar({ remoteUrl: remote, stem, picturesDir });
    } catch (err) {
      console.warn(`  local persist failed, using fal URL: ${err instanceof Error ? err.message : err}`);
      return remote;
    }
  }
  // Offline Comfy fallback when FAL_KEY is absent.
  try {
    return await generateComfyImage(
      card.image_prompt,
      false,
      SFW_CARD_NEGATIVE,
      picturesDir,
      stem,
      'noobai_vpred_workflow.json',
    );
  } catch (err) {
    console.warn(`  image generation skipped: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function main(): Promise<void> {
  process.chdir(appRoot());
  assertSfwBatchRoster();
  const args = parseArgs(process.argv.slice(2));
  const slice = SFW_BATCH_CARDS.filter((c) => c.batchIndex >= args.from && c.batchIndex <= args.to);
  for (const card of slice) assertCardSafe(card);

  if (args.check) {
    console.log(`SFW roster OK: ${SFW_BATCH_CARDS.length} cards.`);
    console.log(`Would process [${args.from}–${args.to}] (${slice.length} cards) in controlled batches.`);
    console.log(slice.map((c) => `${c.batchIndex}. ${c.genre} · ${c.name}`).join('\n'));
    return;
  }

  const prisma = new PrismaClient();
  const picturesDir = path.join(process.cwd(), 'public', 'nexus_assets', 'images');
  const profilesDir = path.join(process.cwd(), 'data', 'generated-sfw-cards');
  await fsp.mkdir(profilesDir, { recursive: true });
  await fsp.mkdir(path.join(picturesDir, 'sfw'), { recursive: true });

  try {
    const owner = await nexusSystemUserId(prisma);
    let done = 0;
    for (const card of slice) {
      console.log(`[${card.batchIndex}/50] ${card.genre} SFW ${card.name}`);
      assertCardSafe(card);

      let avatar: string | null = null;
      if (!args.textOnly) {
        avatar = await renderAvatar(card, owner.id, picturesDir);
      }

      const data = buildCharacterData(card, avatar, owner.id);
      // Stable id upsert — never wipe unrelated cards.
      await prisma.character.upsert({
        where: { id: card.id },
        update: data,
        create: { id: card.id, ...data },
      });

      if (!args.skipCloud) {
        await upsertSupabaseCharacter({
          character: {
            id: card.id,
            name: data.name,
            title: data.title,
            summary: data.summary,
            personality: data.personality,
            scenario: data.scenario,
            initialMessage: data.initialMessage,
            tags: data.tags,
            avatar: data.avatar,
            nsfw: false,
            visibility: data.visibility,
          },
          ownerEmail: owner.email,
          ownerLocalId: owner.id,
        });
      }

      const profile = {
        ...card,
        avatar,
        prismaId: card.id,
        rating: 'sfw' as const,
        is_nsfw: false as const,
      };
      await fsp.writeFile(
        path.join(profilesDir, `${String(card.batchIndex).padStart(3, '0')}-${card.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`),
        JSON.stringify(profile, null, 2),
      );
      done += 1;
      console.log(`  upserted ${card.id}${avatar ? ` · avatar ${avatar}` : ' · text-only'}`);
      if (done < slice.length) await sleep(DELAY_MS);
    }
    console.log(`Finished SFW batch: ${done} cards upserted (${args.from}–${args.to}). Existing library left intact.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
