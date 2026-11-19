export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, json } from '@/lib/access';
import { personaInput, normalizePersonaBindings, withAvatarSnapshot, personaDto } from '@/lib/persona-server';
import { deletePersonaFromCloud, syncPersonaToCloud } from '@/lib/supabase/sync';
import { ensureVisualColumns } from '@/lib/ensure-visual-columns';
import { gateAvatarImage, avatarGateResponse } from '@/lib/vision/image-moderation';
import { logModerationFlag } from '@/lib/trust-safety';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  try {
    await ensureVisualColumns();
    const { id } = await params;
    const userId = viewer.user.id;
    const existing = await prisma.persona.findFirst({ where: { id, userId } });
    if (!existing) return json({ error: 'Persona not found' }, 404);
    const input = personaInput(await request.json().catch(() => ({})));
    if (!input.name) return json({ error: 'Display name is required' }, 400);
    const imageBlock = await gateAvatarImage({ imageUrl: input.avatar, wantsNsfw: true });
    if (imageBlock?.kind === 'underage') {
      await logModerationFlag({
        userId,
        route: '/api/personas/[id]',
        category: 'minors',
        matched: 'vlm_underage_multi_signal',
      });
      return avatarGateResponse(imageBlock);
    }
    const data = await withAvatarSnapshot(input, existing);
    const persona = await prisma.persona.update({ where: { id }, data });
    await normalizePersonaBindings(userId, persona);
    const saved = await prisma.persona.findUnique({ where: { id } });
    if (saved) void syncPersonaToCloud(saved, viewer.user);
    return json(saved ? personaDto(saved) : null);
  } catch (err: any) {
    console.error('PUT /api/personas/[id] error:', err);
    return json({ error: 'Failed to save persona' }, 500);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  const { id } = await params;
  const userId = viewer.user.id;
  const existing = await prisma.persona.findFirst({ where: { id, userId } });
  if (!existing) return json({ error: 'Persona not found' }, 404);
  await prisma.persona.delete({ where: { id } });
  void deletePersonaFromCloud(id, viewer.user);
  await prisma.chatSession.updateMany({ where: { userId, personaId: id }, data: { personaId: null } });
  if (existing.isDefault) {
    const next = await prisma.persona.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
    if (next) await prisma.persona.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  return json({ success: true });
}
