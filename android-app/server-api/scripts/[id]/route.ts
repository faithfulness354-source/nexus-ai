export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, json, can } from '@/lib/access';
import { scriptInput } from '@/lib/hub-server';
import { compileScript } from '@/lib/hubs';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  try {
    const { id } = await params;
    const existing = await prisma.userScript.findFirst({ where: { id, userId: viewer.user.id } });
    if (!existing) return json({ error: 'Script not found' }, 404);
    const data = scriptInput(await request.json().catch(() => ({})));
    if (data.kind === 'PROMPT' && !can(viewer, 'customPrompts')) {
      return json({ error: 'Prompt scripts unlock with the Plus plan.', code: 'UPGRADE_REQUIRED', feature: 'customPrompts' }, 402);
    }
    if (!data.name) return json({ error: 'Name is required' }, 400);
    if (data.kind === 'REGEX') {
      const re = compileScript(data.findPattern, data.flags);
      if (typeof re === 'string') return json({ error: `Invalid pattern: ${re}` }, 400);
    } else if (!data.promptText.trim()) return json({ error: 'Prompt text is required' }, 400);
    return json(await prisma.userScript.update({ where: { id }, data }));
  } catch (err: any) {
    console.error('PUT /api/scripts/[id] error:', err);
    return json({ error: err?.message ?? 'Failed to save script' }, 500);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  const { id } = await params;
  const existing = await prisma.userScript.findFirst({ where: { id, userId: viewer.user.id } });
  if (!existing) return json({ error: 'Script not found' }, 404);
  await prisma.userScript.delete({ where: { id } });
  return json({ success: true });
}
