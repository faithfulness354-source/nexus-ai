export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, json, can } from '@/lib/access';
import { lorebookInput, entriesInput } from '@/lib/hub-server';

/** Saves lorebook settings and replaces its entries with the submitted list. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  if (!can(viewer, 'customPrompts')) return json({ error: 'Lorebook editing unlocks with the Plus plan.', code: 'UPGRADE_REQUIRED', feature: 'customPrompts' }, 402);
  try {
    const { id } = await params;
    const existing = await prisma.lorebook.findFirst({ where: { id, userId: viewer.user.id } });
    if (!existing) return json({ error: 'Lorebook not found' }, 404);
    const body = await request.json().catch(() => ({}));
    const data = lorebookInput(body);
    if (!data.name) return json({ error: 'Lorebook name is required' }, 400);
    const entries = entriesInput(body?.entries);
    await prisma.$transaction([
      prisma.lorebook.update({ where: { id }, data }),
      prisma.loreEntry.deleteMany({ where: { lorebookId: id } }),
      prisma.loreEntry.createMany({ data: entries.map((e) => ({ ...e, lorebookId: id })) }),
    ]);
    return json(await prisma.lorebook.findUnique({ where: { id }, include: { entries: { orderBy: { order: 'asc' } } } }));
  } catch (err: any) {
    console.error('PUT /api/lorebooks/[id] error:', err);
    return json({ error: err?.message ?? 'Failed to save lorebook' }, 500);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  const { id } = await params;
  const existing = await prisma.lorebook.findFirst({ where: { id, userId: viewer.user.id } });
  if (!existing) return json({ error: 'Lorebook not found' }, 404);
  await prisma.lorebook.delete({ where: { id } });
  return json({ success: true });
}
