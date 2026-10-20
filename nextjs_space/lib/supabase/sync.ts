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

type StoredStatic = {
  local_id?: string;
  summary?: string | null;
  personality?: string | null;
  scenario?: string | null;
  greeting?: string | null;
};

function sameStatic(sent: Record<string, unknown>[], stored: StoredStatic[] | null) {
  for (const row of sent) {
    const found = (stored ?? []).find((item) => item.local_id === row.local_id);
    if (!found) throw new Error('Supabase did not confirm the character row');
    for (const key of ['summary', 'personality', 'scenario', 'greeting'] as const) {
      const actual = typeof found[key] === 'string' ? found[key] : '';
      const expected = typeof row[key] === 'string' ? row[key] : '';
      if (actual !== expected) throw new Error(`Supabase stored a different ${key} than the character card`);
    }
  }
}

async function upsertCharacters(admin: NonNullable<ReturnType<typeof supabaseAdmin>>, rows: Record<string, unknown> | Record<string, unknown>[]) {
  const list = Array.isArray(rows) ? rows : [rows];
  const columns = 'local_id,summary,personality,scenario,greeting';
  const first = await admin.from('characters').upsert(list, { onConflict: 'local_id' }).select(columns);
  if (!first.error) {
    sameStatic(list, first.data);
    return;
  }
  if (!/banner/i.test(first.error.message ?? '')) throw new Error(first.error.message);
  const withoutBanner = list.map(({ banner: _banner, ...row }) => row);
  const second = await admin.from('characters').upsert(withoutBanner, { onConflict: 'local_id' }).select(columns);
  if (second.error) throw new Error(second.error.message);
  sameStatic(withoutBanner, second.data);
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
  banner?: string | null;
  nsfw?: boolean | null;
  visibility?: string | null;
}, owner: Owner): Promise<void> {
  const admin = supabaseAdmin();
  if (!admin) return;
  const userId = await ownerId(owner);
  if (!userId) throw new Error('Supabase account is not available for this save');
  const summary = typeof character.summary === 'string' ? character.summary : '';
  const personality = typeof character.personality === 'string' ? character.personality : '';
  const scenario = typeof character.scenario === 'string' ? character.scenario : '';
  const greeting = typeof character.initialMessage === 'string' ? character.initialMessage : '';
  await upsertCharacters(admin, {
    local_id: character.id,
    user_id: userId,
    name: character.name || 'Unnamed',
    title: character.title ?? '',
    summary,
    personality,
    scenario,
    greeting,
    tags: character.tags ?? '',
    avatar: character.avatar ?? null,
    banner: character.banner ?? null,
    nsfw: character.nsfw === true,
    visibility: character.visibility ?? 'PRIVATE',
    updated_at: new Date().toISOString(),
  });
  const scenarioWrite = await admin.from('scenarios').upsert({
    local_id: `${character.id}:scenario`,
    user_id: userId,
    character_local_id: character.id,
    title: character.name || 'Scenario',
    body: scenario,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'local_id' }).select('body');
  if (scenarioWrite.error) throw new Error(scenarioWrite.error.message);
  const storedScenario = scenarioWrite.data?.[0]?.body;
  if ((typeof storedScenario === 'string' ? storedScenario : '') !== scenario) {
    throw new Error('Supabase stored a different scenario than the character card');
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
  } catch (error) {
    console.error('[supabase] persona sync failed', error instanceof Error ? error.message : 'unknown');
  }
}

export async function deleteCharacterFromCloud(localId: string, owner: Owner): Promise<void> {
  try {
    const admin = supabaseAdmin();
    const userId = await ownerId(owner);
    if (!admin || !userId || !localId) return;
    const removed = await admin.from('characters').delete().eq('local_id', localId).eq('user_id', userId);
    if (removed.error) console.error('[supabase] character delete failed', removed.error.message);
    await admin.from('scenarios').delete().eq('character_local_id', localId).eq('user_id', userId);
  } catch (error) {
    console.error('[supabase] character delete failed', error instanceof Error ? error.message : 'unknown');
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
      await upsertCharacters(admin, characters.map((character) => ({
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
        banner: character.banner ?? null,
        nsfw: character.nsfw === true,
        visibility: character.visibility ?? 'PRIVATE',
        updated_at: now,
      })));
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
    const messages = await prisma.message.findMany({
      where: { session: { userId: owner.id } },
      select: { id: true, sessionId: true, role: true, content: true, index: true, deleted: true },
    });
    const chunk = 200;
    for (let i = 0; i < messages.length; i += chunk) {
      await admin.from('chat_messages').upsert(messages.slice(i, i + chunk).map((message) => ({
        local_id: message.id,
        chat_local_id: message.sessionId,
        user_id: userId,
        role: message.role,
        content: message.content ?? '',
        index: message.index,
        deleted: message.deleted === true,
      })), { onConflict: 'local_id' });
    }
  } catch {
    pushedAt.delete(owner.id);
  }
}
