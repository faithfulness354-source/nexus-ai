import 'server-only';
import { prisma } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ensureCloudUser } from '@/lib/supabase/identity';

const pushedAt = new Map<string, number>();
const PUSH_GAP_MS = 5 * 60 * 1000;

type Owner = { id: string; email: string };

async function ownerId(owner: Owner): Promise<string | null> {
  try {
    return await ensureCloudUser(owner.email, owner.id);
  } catch {
    return null;
  }
}

export async function syncCharacterToCloud(character: {
  id: string;
  name: string;
  title?: string | null;
  summary?: string | null;
  personality?: string | null;
  scenario?: string | null;
  initialMessage?: string | null;
  tags?: string | null;
  avatar?: string | null;
  nsfw?: boolean | null;
  visibility?: string | null;
}, owner: Owner): Promise<void> {
  try {
    const admin = supabaseAdmin();
    const userId = await ownerId(owner);
    if (!admin || !userId) return;
    await admin.from('characters').upsert({
      local_id: character.id,
      user_id: userId,
      name: character.name || 'Unnamed',
      title: character.title ?? '',
      summary: character.summary ?? '',
      personality: character.personality ?? '',
      scenario: character.scenario ?? '',
      greeting: character.initialMessage ?? '',
      tags: character.tags ?? '',
      avatar: character.avatar ?? null,
      nsfw: character.nsfw === true,
      visibility: character.visibility ?? 'PRIVATE',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'local_id' });
    await admin.from('scenarios').upsert({
      local_id: `${character.id}:scenario`,
      user_id: userId,
      character_local_id: character.id,
      title: character.name || 'Scenario',
      body: character.scenario ?? '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'local_id' });
  } catch {
    // Local save already succeeded. Cloud sync can retry on the next write.
  }
}

export async function syncChatToCloud(chat: {
  id: string;
  characterId: string;
  title?: string | null;
  model?: string | null;
  provider?: string | null;
}, owner: Owner): Promise<void> {
  try {
    const admin = supabaseAdmin();
    const userId = await ownerId(owner);
    if (!admin || !userId) return;
    await admin.from('chats').upsert({
      local_id: chat.id,
      user_id: userId,
      character_local_id: chat.characterId,
      title: chat.title || 'New Chat',
      model: chat.model ?? '',
      provider: chat.provider ?? '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'local_id' });
  } catch {
    // Local chat remains the source of truth when the cloud is unreachable.
  }
}

export async function syncPersonaToCloud(persona: {
  id: string;
  name: string;
  avatar?: string | null;
  pronouns?: string | null;
  physical?: string | null;
  attire?: string | null;
  visualTraits?: string | null;
  appearance?: string | null;
  avatarSnapshot?: string | null;
  avatarSnapshotFor?: string | null;
  personality?: string | null;
  backstory?: string | null;
  speech?: string | null;
  isDefault?: boolean | null;
  boundCharacterIds?: string | null;
}, owner: Owner): Promise<void> {
  try {
    const admin = supabaseAdmin();
    const userId = await ownerId(owner);
    if (!admin || !userId) return;
    await admin.from('personas').upsert({
      local_id: persona.id,
      user_id: userId,
      name: persona.name || '',
      avatar: persona.avatar ?? null,
      pronouns: persona.pronouns || 'They/Them',
      physical: persona.physical ?? '',
      attire: persona.attire ?? '',
      visual_traits: persona.visualTraits ?? '',
      appearance: persona.appearance || '{}',
      avatar_snapshot: persona.avatarSnapshot ?? '',
      avatar_snapshot_for: persona.avatarSnapshotFor ?? '',
      personality: persona.personality ?? '',
      backstory: persona.backstory ?? '',
      speech: persona.speech ?? '',
      is_default: persona.isDefault === true,
      bound_character_ids: persona.boundCharacterIds || '[]',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'local_id' });
  } catch {
    // The local persona remains saved when the cloud write fails.
  }
}

export async function deletePersonaFromCloud(localId: string, owner: Owner): Promise<void> {
  try {
    const admin = supabaseAdmin();
    const userId = await ownerId(owner);
    if (!admin || !userId || !localId) return;
    await admin.from('personas').delete().eq('local_id', localId).eq('user_id', userId);
  } catch {
    // A missed cloud delete is retried the next time this account is pushed.
  }
}

export async function syncMessageToCloud(message: {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  index: number;
  deleted?: boolean;
}, owner: Owner): Promise<void> {
  try {
    const admin = supabaseAdmin();
    const userId = await ownerId(owner);
    if (!admin || !userId) return;
    await admin.from('chat_messages').upsert({
      local_id: message.id,
      chat_local_id: message.sessionId,
      user_id: userId,
      role: message.role,
      content: message.content ?? '',
      index: message.index,
      deleted: message.deleted === true,
    }, { onConflict: 'local_id' });
  } catch {
    // A failed cloud write does not roll back the local message.
  }
}

/** Copies this account's saved characters, scenarios, chats, and messages. Skips repeat passes for a few minutes. */
export async function pushLocalAccount(owner: Owner): Promise<void> {
  const last = pushedAt.get(owner.id) ?? 0;
  if (Date.now() - last < PUSH_GAP_MS) return;
  pushedAt.set(owner.id, Date.now());
  try {
    const admin = supabaseAdmin();
    const userId = await ownerId(owner);
    if (!admin || !userId) return;
    const now = new Date().toISOString();
    const characters = await prisma.character.findMany({ where: { ownerId: owner.id } });
    if (characters.length) {
      await admin.from('characters').upsert(characters.map((character) => ({
        local_id: character.id,
        user_id: userId,
        name: character.name || 'Unnamed',
        title: character.title ?? '',
        summary: character.summary ?? '',
        personality: character.personality ?? '',
        scenario: character.scenario ?? '',
        greeting: character.initialMessage ?? '',
        tags: character.tags ?? '',
        avatar: character.avatar ?? null,
        nsfw: character.nsfw === true,
        visibility: character.visibility ?? 'PRIVATE',
        updated_at: now,
      })), { onConflict: 'local_id' });
      await admin.from('scenarios').upsert(characters.map((character) => ({
        local_id: `${character.id}:scenario`,
        user_id: userId,
        character_local_id: character.id,
        title: character.name || 'Scenario',
        body: character.scenario ?? '',
        updated_at: now,
      })), { onConflict: 'local_id' });
    }
    const chats = await prisma.chatSession.findMany({ where: { userId: owner.id } });
    if (chats.length) {
      await admin.from('chats').upsert(chats.map((chat) => ({
        local_id: chat.id,
        user_id: userId,
        character_local_id: chat.characterId,
        title: chat.title || 'New Chat',
        model: chat.model ?? '',
        provider: chat.provider ?? '',
        updated_at: now,
      })), { onConflict: 'local_id' });
    }
    const personas = await prisma.persona.findMany({ where: { userId: owner.id } });
    if (personas.length) {
      await admin.from('personas').upsert(personas.map((persona) => ({
        local_id: persona.id,
        user_id: userId,
        name: persona.name || '',
        avatar: persona.avatar ?? null,
        pronouns: persona.pronouns || 'They/Them',
        physical: persona.physical ?? '',
        attire: persona.attire ?? '',
        visual_traits: persona.visualTraits ?? '',
        appearance: persona.appearance || '{}',
        avatar_snapshot: persona.avatarSnapshot ?? '',
        avatar_snapshot_for: persona.avatarSnapshotFor ?? '',
        personality: persona.personality ?? '',
        backstory: persona.backstory ?? '',
        speech: persona.speech ?? '',
        is_default: persona.isDefault === true,
        bound_character_ids: persona.boundCharacterIds || '[]',
        updated_at: now,
      })), { onConflict: 'local_id' });
    }
    const messages = await prisma.$queryRaw<Array<{
      id: string;
      sessionId: string;
      role: string;
      content: string;
      index: number;
      deleted: number | boolean;
    }>>`
      SELECT m.id, m."sessionId" as "sessionId", m.role, m.content, m."index" as "index", m.deleted
      FROM "Message" m
      INNER JOIN "ChatSession" s ON s.id = m."sessionId"
      WHERE s."userId" = ${owner.id}
    `;
    const chunk = 200;
    for (let i = 0; i < messages.length; i += chunk) {
      await admin.from('chat_messages').upsert(messages.slice(i, i + chunk).map((message) => ({
        local_id: message.id,
        chat_local_id: message.sessionId,
        user_id: userId,
        role: message.role,
        content: message.content ?? '',
        index: message.index,
        deleted: message.deleted === true || message.deleted === 1,
      })), { onConflict: 'local_id' });
    }
  } catch {
    pushedAt.delete(owner.id);
  }
}
