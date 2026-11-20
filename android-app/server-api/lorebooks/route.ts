export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, json, can } from '@/lib/access';
import { lorebookInput, entriesInput, packList, unpackList } from '@/lib/hub-server';

const LORE_LOCKED = { error: 'Lorebook creation unlocks with the Plus plan.', code: 'UPGRADE_REQUIRED', feature: 'customPrompts' };

function presentBook<T extends { characterIds: string; personaIds: string; entries: { keys: string }[] }>(book: T) {
  return {
    ...book,
    characterIds: unpackList(book.characterIds),
    personaIds: unpackList(book.personaIds),
    entries: book.entries.map((entry) => ({ ...entry, keys: unpackList(entry.keys) })),
  };
}

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  try {
    const books = await prisma.lorebook.findMany({
      where: { userId: viewer.user.id },
      include: { entries: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } },
      orderBy: { updatedAt: 'desc' },
    });
    return json(books.map(presentBook));
  } catch (err: unknown) {
    console.error('GET /api/lorebooks error:', err);
    return json({ error: 'Failed to load lorebooks' }, 500);
  }
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  if (!can(viewer, 'customPrompts')) return json(LORE_LOCKED, 402);
  try {
    const body = await request.json().catch(() => ({}));
    const data = lorebookInput(body);
    if (!data.name) return json({ error: 'Lorebook name is required' }, 400);
    if ((await prisma.lorebook.count({ where: { userId: viewer.user.id } })) >= 100) return json({ error: 'You can have up to 100 lorebooks.' }, 400);
    const entries = entriesInput(body?.entries);
    const book = await prisma.lorebook.create({
      data: {
        ...data,
        userId: viewer.user.id,
        characterIds: packList(data.characterIds),
        personaIds: packList(data.personaIds),
        entries: { create: entries.map((entry) => ({ ...entry, keys: packList(entry.keys) })) },
      },
      include: { entries: { orderBy: { order: 'asc' } } },
    });
    return json(presentBook(book), 201);
  } catch (err: any) {
    console.error('POST /api/lorebooks error:', err);
    return json({ error: err?.message ?? 'Failed to save lorebook' }, 500);
  }
}
