import 'server-only';
import { prisma } from '@/lib/db';
import { normalizeAchievements, normalizeStats, type WorldStateRow, type WorldStats } from './types';

const VECTOR = 'extensions.vector';

export async function ensureWorldState(sessionId: string): Promise<WorldStateRow> {
  const rows = await prisma.$queryRawUnsafe<Array<{ stats: unknown; unlocked_achievements: unknown }>>(
    `insert into public.world_states (session_id)
     values ($1)
     on conflict (session_id) do update set session_id = excluded.session_id
     returning stats, unlocked_achievements`,
    sessionId,
  );
  const row = rows[0];
  return {
    sessionId,
    stats: normalizeStats(row?.stats),
    unlockedAchievements: normalizeAchievements(row?.unlocked_achievements),
  };
}

export async function matchMemories(sessionId: string, embedding: number[], k: number): Promise<string[]> {
  if (embedding.length !== 1536) return [];
  const rows = await prisma.$queryRawUnsafe<Array<{ content: string; similarity: number }>>(
    `select content, 1 - (embedding OPERATOR(extensions.<=>) $2::${VECTOR}) as similarity
     from public.memories
     where session_id = $1 and embedding is not null
     order by embedding OPERATOR(extensions.<=>) $2::${VECTOR}
     limit $3`,
    sessionId,
    toVectorLiteral(embedding),
    Math.max(1, Math.min(k, 12)),
  );
  return rows
    .filter((row) => typeof row.content === 'string' && row.content.trim() && Number(row.similarity) >= 0.2)
    .map((row) => row.content.trim());
}

export async function applyWorldPatch(sessionId: string, stats: Partial<WorldStats>, achievements: string[]): Promise<void> {
  await ensureWorldState(sessionId);
  if (!Object.keys(stats).length && !achievements.length) return;
  await prisma.$executeRawUnsafe(
    `update public.world_states
     set stats = stats || $2::jsonb,
         unlocked_achievements = (
           select coalesce(array_agg(distinct item), '{}')
           from unnest(unlocked_achievements || $3::text[]) as item
           where item <> ''
         ),
         updated_at = now()
     where session_id = $1`,
    sessionId,
    JSON.stringify(stats),
    pgTextArray(achievements),
  );
}

export async function insertMemory(sessionId: string, content: string, embedding: number[]): Promise<void> {
  if (embedding.length !== 1536) return;
  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `select id from public.memories where session_id = $1 and content = $2 limit 1`,
    sessionId,
    content,
  );
  if (existing.length) return;
  await prisma.$executeRawUnsafe(
    `insert into public.memories (session_id, content, embedding)
     values ($1, $2, $3::${VECTOR})`,
    sessionId,
    content,
    toVectorLiteral(embedding),
  );
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.map((value) => (Number.isFinite(value) ? value : 0)).join(',')}]`;
}

function pgTextArray(items: string[]): string {
  if (!items.length) return '{}';
  return `{${items.map((item) => `"${item.replace(/(["\\])/g, '\\$1')}"`).join(',')}}`;
}
