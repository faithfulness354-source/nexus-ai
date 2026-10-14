import 'server-only';
import { prisma } from '@/lib/db';
import { ensureCloudUser } from '@/lib/supabase/identity';
import { supabaseAdmin } from '@/lib/supabase/admin';

type Owner = { id: string; email: string };
type Row = Record<string, unknown>;

const pulledAt = new Map<string, number>();
const PULL_GAP_MS = 60 * 1000;

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function visibility(value: unknown): 'PUBLIC' | 'UNLISTED' | 'PRIVATE' {
  return value === 'PUBLIC' || value === 'UNLISTED' ? value : 'PRIVATE';
}

async function owns(owner: Owner, record: Row): Promise<boolean> {
  const userId = await ensureCloudUser(owner.email, owner.id);
  return Boolean(userId) && record.user_id === userId;
}

export async function applyRemoteRecord(owner: Owner, table: string, record: Row): Promise<void> {
  const localId = text(record.local_id);
  if (!localId || localId.startsWith('draft:') || !(await owns(owner, record))) return;

  if (table === 'characters') {
    const existing = await prisma.character.findUnique({ where: { id: localId } });
    if (existing && existing.ownerId !== owner.id) return;
    const keepGreeting = existing?.name.trim() === 'Sienna&Saffron';
    const data = {
      name: text(record.name, 'Unnamed'),
      title: text(record.title),
      summary: text(record.summary),
      personality: text(record.personality),
      scenario: text(record.scenario),
      greeting: text(record.greeting),
      tags: text(record.tags),
      avatar: text(record.avatar) || null,
      nsfw: record.nsfw === true,
      visibility: visibility(record.visibility),
    };
    if (existing) {
      const nextGreeting = keepGreeting ? existing.initialMessage : data.greeting;
      const same = existing.name === data.name
        && existing.title === data.title
        && existing.summary === data.summary
        && existing.personality === data.personality
        && existing.scenario === data.scenario
        && existing.tags === data.tags
        && (existing.avatar ?? null) === data.avatar
        && existing.nsfw === data.nsfw
        && existing.visibility === data.visibility
        && existing.initialMessage === nextGreeting;
      if (same) return;
      await prisma.character.update({
        where: { id: localId },
        data: {
          name: data.name,
          title: data.title,
          summary: data.summary,
          personality: data.personality,
          scenario: data.scenario,
          tags: data.tags,
          avatar: data.avatar,
          nsfw: data.nsfw,
          visibility: data.visibility,
          ...(keepGreeting ? {} : { initialMessage: data.greeting }),
        },
      });
      return;
    }
    await prisma.character.create({
      data: {
        id: localId,
        ownerId: owner.id,
        name: data.name,
        title: data.title,
        summary: data.summary,
        personality: data.personality,
        scenario: data.scenario,
        initialMessage: data.greeting,
        exampleDialogue: '',
        customRules: '{"meters":[],"rules":[]}',
        systemPrompt: '',
        creatorNotes: '',
        tags: data.tags,
        avatar: data.avatar,
        nsfw: data.nsfw,
        visibility: data.visibility,
      },
    });
    return;
  }

  if (table === 'scenarios') {
    const characterId = text(record.character_local_id);
    if (!characterId || characterId.startsWith('draft:')) return;
    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (!character || character.ownerId !== owner.id) return;
    const scenario = text(record.body);
    if (character.scenario === scenario) return;
    await prisma.character.update({ where: { id: characterId }, data: { scenario } });
    return;
  }

  if (table === 'chats') {
    const characterId = text(record.character_local_id);
    const character = characterId ? await prisma.character.findUnique({ where: { id: characterId } }) : null;
    if (!character) return;
    const existing = await prisma.chatSession.findUnique({ where: { id: localId } });
    if (existing && existing.userId && existing.userId !== owner.id) return;
    const title = text(record.title, 'New Chat');
    if (existing) {
      if (existing.title !== title) await prisma.chatSession.update({ where: { id: localId }, data: { title } });
      return;
    }
    await prisma.chatSession.create({
      data: {
        id: localId,
        characterId,
        userId: owner.id,
        title,
        model: text(record.model, 'gemini-flash-latest'),
        provider: text(record.provider, 'GEMINI'),
      },
    });
    return;
  }

  if (table === 'chat_messages') {
    const sessionId = text(record.chat_local_id);
    const role = text(record.role);
    if (!sessionId || (role !== 'USER' && role !== 'ASSISTANT' && role !== 'SYSTEM')) return;
    const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (!session || (session.userId && session.userId !== owner.id)) return;
    const content = text(record.content);
    const index = Number.isInteger(record.index) ? Number(record.index) : 0;
    const deleted = record.deleted === true || record.deleted === 1;
    const existing = await prisma.message.findUnique({ where: { id: localId } });
    if (existing) {
      if (existing.sessionId !== sessionId) return;
      if (existing.content !== content || existing.role !== role) {
        await prisma.message.update({ where: { id: localId }, data: { content, role } });
      }
    } else {
      await prisma.message.create({ data: { id: localId, sessionId, role, content, index } });
    }
    if (deleted) {
      await prisma.$executeRaw`UPDATE "Message" SET "deleted" = 1 WHERE id = ${localId}`;
    }
    return;
  }

  if (table === 'personas') {
    const existing = await prisma.persona.findUnique({ where: { id: localId } });
    if (existing && existing.userId !== owner.id) return;
    const data = {
      name: text(record.name).slice(0, 60),
      avatar: text(record.avatar) || null,
      pronouns: text(record.pronouns, 'They/Them').slice(0, 40),
      physical: text(record.physical),
      attire: text(record.attire),
      visualTraits: text(record.visual_traits),
      appearance: text(record.appearance, '{}'),
      avatarSnapshot: text(record.avatar_snapshot),
      avatarSnapshotFor: text(record.avatar_snapshot_for),
      personality: text(record.personality),
      backstory: text(record.backstory),
      speech: text(record.speech),
      isDefault: record.is_default === true,
      boundCharacterIds: text(record.bound_character_ids, '[]'),
    };
    if (!data.name) return;
    if (existing) {
      const same = existing.name === data.name
        && (existing.avatar ?? null) === data.avatar
        && existing.pronouns === data.pronouns
        && existing.physical === data.physical
        && existing.attire === data.attire
        && existing.visualTraits === data.visualTraits
        && existing.appearance === data.appearance
        && existing.avatarSnapshot === data.avatarSnapshot
        && existing.avatarSnapshotFor === data.avatarSnapshotFor
        && existing.personality === data.personality
        && existing.backstory === data.backstory
        && existing.speech === data.speech
        && existing.isDefault === data.isDefault
        && existing.boundCharacterIds === data.boundCharacterIds;
      if (same) return;
    }
    if (data.isDefault) {
      await prisma.persona.updateMany({ where: { userId: owner.id, NOT: { id: localId } }, data: { isDefault: false } });
    }
    if (existing) {
      await prisma.persona.update({ where: { id: localId }, data });
      return;
    }
    await prisma.persona.create({ data: { id: localId, userId: owner.id, ...data } });
  }
}

const libraryPulledAt = new Map<string, number>();
const LIBRARY_GAP_MS = 10 * 1000;

/** Copies this account's cloud characters and personas before a library list is returned. */
export async function pullCloudLibrary(owner: Owner, options?: { force?: boolean }): Promise<void> {
  const last = libraryPulledAt.get(owner.id) ?? 0;
  if (!options?.force && Date.now() - last < LIBRARY_GAP_MS) return;
  libraryPulledAt.set(owner.id, Date.now());
  try {
    const admin = supabaseAdmin();
    const userId = await ensureCloudUser(owner.email, owner.id);
    if (!admin || !userId) return;
    for (const table of ['characters', 'personas'] as const) {
      const { data, error } = await admin.from(table).select('*').eq('user_id', userId);
      if (error) {
        console.error('[supabase] library pull failed', table, error.message);
        continue;
      }
      for (const row of data ?? []) await applyRemoteRecord(owner, table, row as Row);
    }
  } catch (error) {
    libraryPulledAt.delete(owner.id);
    console.error('[supabase] library pull failed', error instanceof Error ? error.message : 'unknown');
  }
}

/** Drops a local card or persona after the owning cloud row is deleted. */
export async function removeRemoteRecord(owner: Owner, table: string, record: Row): Promise<void> {
  const localId = text(record.local_id);
  if (!localId || localId.startsWith('draft:') || !(await owns(owner, record))) return;
  if (table === 'characters') {
    const existing = await prisma.character.findUnique({ where: { id: localId } });
    if (!existing || existing.ownerId !== owner.id) return;
    await prisma.character.delete({ where: { id: localId } });
    return;
  }
  if (table === 'personas') {
    const existing = await prisma.persona.findUnique({ where: { id: localId } });
    if (!existing || existing.userId !== owner.id) return;
    await prisma.persona.delete({ where: { id: localId } });
  }
}

/** Reads this account's cloud rows once a minute and writes the newer copies locally. */
export async function pullCloudAccount(owner: Owner): Promise<void> {
  const last = pulledAt.get(owner.id) ?? 0;
  if (Date.now() - last < PULL_GAP_MS) return;
  pulledAt.set(owner.id, Date.now());
  try {
    const admin = supabaseAdmin();
    const userId = await ensureCloudUser(owner.email, owner.id);
    if (!admin || !userId) return;
    for (const table of ['characters', 'scenarios', 'chats', 'chat_messages', 'personas'] as const) {
      const { data, error } = await admin.from(table).select('*').eq('user_id', userId);
      if (error) {
        console.error('[supabase] account pull failed', table, error.message);
        continue;
      }
      for (const row of data ?? []) await applyRemoteRecord(owner, table, row as Row);
    }
  } catch (error) {
    pulledAt.delete(owner.id);
    console.error('[supabase] account pull failed', error instanceof Error ? error.message : 'unknown');
  }
}
