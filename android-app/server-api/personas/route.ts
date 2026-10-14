export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, json } from '@/lib/access';
import { personaInput, normalizePersonaBindings, withAvatarSnapshot, personaDto } from '@/lib/persona-server';

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  const personas = await prisma.persona.findMany({ where: { userId: viewer.user.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  return json(personas.map(personaDto));
}

/** Create a persona, or clone one with { cloneFrom: id }. */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  try {
    const body = await request.json().catch(() => ({}));
    const userId = viewer.user.id;

    let data;
    if (body?.cloneFrom) {
      const src = await prisma.persona.findFirst({ where: { id: String(body.cloneFrom), userId } });
      if (!src) return json({ error: 'Persona not found' }, 404);
      const { id: _id, createdAt: _c, updatedAt: _u, userId: _uid, ...rest } = src;
      data = { ...rest, name: `${src.name} (copy)`.slice(0, 60), isDefault: false, boundCharacterIds: '[]' };
    } else {
      data = await withAvatarSnapshot(personaInput(body));
      if (!data.name) return json({ error: 'Display name is required' }, 400);
    }
    const isFirst = (await prisma.persona.count({ where: { userId } })) === 0;
    const persona = await prisma.persona.create({ data: { ...data, userId, isDefault: isFirst || !!data.isDefault } });
    await normalizePersonaBindings(userId, persona);
    const saved = await prisma.persona.findUnique({ where: { id: persona.id } });
    return json(saved ? personaDto(saved) : null, 201);
  } catch (err: any) {
    console.error('POST /api/personas error:', err);
    return json({ error: 'Failed to save persona' }, 500);
  }
}
