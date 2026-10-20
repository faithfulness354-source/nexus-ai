export const dynamic = 'force-dynamic';
import { after, NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized } from '@/lib/access';
import { unpackList } from '@/lib/hub-server';
import { toNovelAiV2, type ExportCharacter, type ExportLorebook, type ExportPersona, type ExportSession, type NovelExportSource } from '@/lib/exporters/novelai';
import { supabaseAdmin } from '@/lib/supabase/admin';

const BUCKET = 'novelai_logs';
const KINDS = new Set(['character', 'lorebook', 'persona', 'scenario', 'session']);

function characterOf(row: {
  id: string;
  name: string;
  title: string;
  summary: string;
  personality: string;
  scenario: string;
  initialMessage: string;
  systemPrompt: string;
  exampleDialogue: string;
  tags: string;
}): ExportCharacter {
  return row;
}

export async function POST(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  const body = await request.json().catch(() => null) as { kind?: unknown; id?: unknown } | null;
  const kind = typeof body?.kind === 'string' ? body.kind : '';
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!KINDS.has(kind) || !id) {
    return NextResponse.json({ error: 'kind and id are required' }, { status: 400 });
  }

  const userId = viewer.user.id;
  after(async () => {
    try {
      const source = await loadSource(userId, kind, id);
      if (!source) return;
      const document = toNovelAiV2(source);
      const json = JSON.stringify(document);
      await storeExport(userId, kind, id, json);
      await notifyWebhook(json);
    } catch (err) {
      console.warn('[novelai-sync] backup skipped:', err instanceof Error ? err.message : err);
    }
  });

  return NextResponse.json({ queued: true }, { status: 202 });
}

async function loadSource(userId: string, kind: string, id: string): Promise<NovelExportSource | null> {
  if (kind === 'character' || kind === 'scenario') {
    const character = await prisma.character.findFirst({ where: { id, ownerId: userId } });
    if (!character) return null;
    return bundleForCharacter(userId, characterOf(character));
  }
  if (kind === 'lorebook') {
    const book = await prisma.lorebook.findFirst({ where: { id, userId }, include: { entries: true } });
    if (!book) return null;
    const linkedIds = unpackList(book.characterIds);
    const character = linkedIds[0]
      ? await prisma.character.findFirst({ where: { id: linkedIds[0], ownerId: userId } })
      : null;
    const lorebook: ExportLorebook = { ...book, entries: book.entries };
    if (!character) return { lorebooks: [lorebook], personas: [], sessions: [] };
    const bundle = await bundleForCharacter(userId, characterOf(character));
    const books = bundle.lorebooks ?? [];
    if (!books.some((item) => item.id === book.id)) books.unshift(lorebook);
    return { ...bundle, lorebooks: books };
  }
  if (kind === 'persona') {
    const persona = await prisma.persona.findFirst({ where: { id, userId } });
    if (!persona) return null;
    const bound = unpackList(persona.boundCharacterIds);
    const character = bound[0]
      ? await prisma.character.findFirst({ where: { id: bound[0], ownerId: userId } })
      : null;
    if (!character) {
      return { personas: [persona as ExportPersona], lorebooks: [], sessions: [] };
    }
    const bundle = await bundleForCharacter(userId, characterOf(character));
    const personas = bundle.personas ?? [];
    if (!personas.some((item) => item.id === persona.id)) personas.unshift(persona as ExportPersona);
    return { ...bundle, personas };
  }
  const session = await prisma.chatSession.findFirst({
    where: { id, userId },
    include: { character: true },
  });
  if (!session?.character || session.character.ownerId !== userId) {
    if (!session) return null;
    return {
      sessions: [sessionMeta(session)],
      personas: [],
      lorebooks: [],
    };
  }
  const bundle = await bundleForCharacter(userId, characterOf(session.character));
  const sessions = bundle.sessions ?? [];
  if (!sessions.some((item) => item.id === session.id)) sessions.unshift(sessionMeta(session));
  return { ...bundle, sessions };
}

async function bundleForCharacter(userId: string, character: ExportCharacter): Promise<NovelExportSource> {
  const [lorebooks, personas, sessions] = await Promise.all([
    prisma.lorebook.findMany({ where: { userId }, include: { entries: true } }),
    prisma.persona.findMany({ where: { userId } }),
    prisma.chatSession.findMany({
      where: { userId, characterId: character.id },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { id: true, title: true, model: true, provider: true, updatedAt: true },
    }),
  ]);
  const linkedBooks = lorebooks.filter((book) => {
    if (book.scope === 'GLOBAL') return true;
    if (book.scope === 'CHARACTER') return unpackList(book.characterIds).includes(character.id);
    return false;
  });
  const linkedPersonas = personas.filter((persona) => persona.isDefault || unpackList(persona.boundCharacterIds).includes(character.id));
  return {
    character,
    lorebooks: linkedBooks.map((book) => ({ ...book, entries: book.entries })),
    personas: linkedPersonas,
    sessions,
  };
}

function sessionMeta(session: { id: string; title: string; model: string; provider: string; updatedAt: Date }): ExportSession {
  return session;
}

async function storeExport(userId: string, kind: string, id: string, json: string): Promise<void> {
  const admin = supabaseAdmin();
  if (!admin) return;
  const existing = await admin.storage.getBucket(BUCKET);
  if (!existing.data) {
    const created = await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 8 * 1024 * 1024 });
    if (created.error && !/already exists/i.test(created.error.message)) {
      console.warn('[novelai-sync] bucket skipped:', created.error.message);
      return;
    }
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `${userId}/${kind}/${id}/${stamp}.json`;
  const stored = await admin.storage.from(BUCKET).upload(path, Buffer.from(json, 'utf8'), {
    contentType: 'application/json',
    upsert: false,
  });
  if (stored.error) console.warn('[novelai-sync] upload skipped:', stored.error.message);
}

async function notifyWebhook(json: string): Promise<void> {
  const target = process.env.NOVELAI_SYNC_WEBHOOK_URL?.trim();
  if (!target || !/^https?:\/\//i.test(target)) return;
  await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json,
    signal: AbortSignal.timeout(8000),
  }).catch((err: unknown) => {
    console.warn('[novelai-sync] webhook skipped:', err instanceof Error ? err.message : err);
  });
}
