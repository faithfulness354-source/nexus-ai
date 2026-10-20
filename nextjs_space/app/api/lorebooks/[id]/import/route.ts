export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, json, can } from '@/lib/access';
import { packList, unpackList } from '@/lib/hub-server';
import { parseLoreFile } from '@/lib/lore/import';
import { mirrorLoreImport } from '@/lib/lore/cloud';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 500;

/** Appends a SillyTavern, Janitor, or character-card world info file onto one lorebook. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  if (!can(viewer, 'customPrompts')) {
    return json({ error: 'Lorebook import unlocks with the Plus plan.', code: 'UPGRADE_REQUIRED', feature: 'customPrompts' }, 402);
  }
  try {
    const { id } = await params;
    const book = await prisma.lorebook.findFirst({
      where: { id, userId: viewer.user.id },
      include: { _count: { select: { entries: true } } },
    });
    if (!book) return json({ error: 'Lorebook not found' }, 404);
    const room = MAX_ENTRIES - book._count.entries;
    if (room <= 0) return json({ error: 'This lorebook already has 500 entries.' }, 400);

    const type = request.headers.get('content-type') ?? '';
    let buf: Buffer;
    if (type.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return json({ error: 'Choose a .json or .png file.' }, 400);
      if (file.size > MAX_BYTES) return json({ error: 'That file is larger than 8 MB.' }, 400);
      buf = Buffer.from(await file.arrayBuffer());
    } else {
      const body = await request.json().catch(() => null);
      if (!body) return json({ error: 'Upload a .json or .png file.' }, 400);
      buf = Buffer.from(JSON.stringify(body));
    }

    const parsed = parseLoreFile(buf).slice(0, room);
    const created = await prisma.loreEntry.createManyAndReturn({
      data: parsed.map((entry) => ({
        lorebookId: id,
        title: entry.title,
        keys: packList(entry.keywords),
        content: entry.content,
        order: entry.insertion_order,
        priority: entry.priority,
        depth: entry.scan_depth,
        placement: entry.placement,
        constant: entry.constant,
        enabled: entry.enabled,
      })),
    });
    await prisma.lorebook.update({ where: { id }, data: { updatedAt: new Date() } });
    void mirrorLoreImport(
      viewer.user,
      book,
      created.map((entry, index) => ({ ...parsed[index], localId: entry.id })),
    ).catch((error: unknown) => {
      console.error('[supabase] lore import mirror failed', error instanceof Error ? error.message : 'unknown');
    });
    return json({
      inserted: created.length,
      entries: created.map((entry, index) => ({
        ...entry,
        keys: unpackList(entry.keys),
        keywords: parsed[index]?.keywords ?? [],
      })),
    }, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Import failed';
    console.error('POST /api/lorebooks/[id]/import error:', message);
    return json({ error: message }, 400);
  }
}
