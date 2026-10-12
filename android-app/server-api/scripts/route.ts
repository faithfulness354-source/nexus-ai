export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, json, can } from '@/lib/access';
import { scriptInput } from '@/lib/hub-server';
import { compileScript } from '@/lib/hubs';

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  const scripts = await prisma.userScript.findMany({ where: { userId: viewer.user.id }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  return json(scripts);
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  try {
    const data = scriptInput(await request.json().catch(() => ({})));
    if (data.kind === 'PROMPT' && !can(viewer, 'customPrompts')) {
      return json({ error: 'Prompt scripts unlock with the Plus plan.', code: 'UPGRADE_REQUIRED', feature: 'customPrompts' }, 402);
    }
    if (!data.name) return json({ error: 'Name is required' }, 400);
    if (data.kind === 'REGEX') {
      const re = compileScript(data.findPattern, data.flags);
      if (typeof re === 'string') return json({ error: `Invalid pattern: ${re}` }, 400);
    } else if (!data.promptText.trim()) return json({ error: 'Prompt text is required' }, 400);
    if ((await prisma.userScript.count({ where: { userId: viewer.user.id } })) >= 200) return json({ error: 'You can have up to 200 scripts.' }, 400);
    const script = await prisma.userScript.create({ data: { ...data, userId: viewer.user.id } });
    return json(script, 201);
  } catch (err: any) {
    console.error('POST /api/scripts error:', err);
    return json({ error: err?.message ?? 'Failed to save script' }, 500);
  }
}
