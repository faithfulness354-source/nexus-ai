export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, json, can } from '@/lib/access';
import { lorebookInput, entriesInput } from '@/lib/hub-server';

const LORE_LOCKED = { error: 'Lorebook creation unlocks with the Plus plan.', code: 'UPGRADE_REQUIRED', feature: 'customPrompts' };

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  const books = await prisma.lorebook.findMany({
    where: { userId: viewer.user.id },
    include: { entries: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } },
    orderBy: { updatedAt: 'desc' },
  });
  return json(books);
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
    const book = await prisma.lorebook.create({
      data: { ...data, userId: viewer.user.id, entries: { create: entriesInput(body?.entries) } },
      include: { entries: { orderBy: { order: 'asc' } } },
    });
    return json(book, 201);
  } catch (err: any) {
    console.error('POST /api/lorebooks error:', err);
    return json({ error: err?.message ?? 'Failed to save lorebook' }, 500);
  }
}
