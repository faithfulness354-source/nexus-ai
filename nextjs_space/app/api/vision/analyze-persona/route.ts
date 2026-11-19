export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';
import { getViewer, unauthorized, json } from '@/lib/access';
import { analyzePersonaImage, configuredVlmModel } from '@/lib/vision/vlm';
import { syncPersonaToCloud } from '@/lib/supabase/sync';
import { personaDto } from '@/lib/persona-server';

/**
 * Upload-time VLM analysis for persona (or character) portraits.
 * Body: { personaId?: string, characterId?: string, imageUrl?: string }
 * On timeout / missing key, returns empty visual fields with timedOut=true and does not fail the caller.
 */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();

  try {
    const body = await request.json().catch(() => ({}));
    const personaId = typeof body?.personaId === 'string' ? body.personaId.trim() : '';
    const characterId = typeof body?.characterId === 'string' ? body.characterId.trim() : '';
    const imageUrlOverride = typeof body?.imageUrl === 'string' ? body.imageUrl.trim() : '';

    if (personaId) {
      const persona = await prisma.persona.findFirst({ where: { id: personaId, userId: viewer.user.id } });
      if (!persona) return json({ error: 'Persona not found' }, 404);
      const imageUrl = imageUrlOverride || persona.avatar || '';
      if (!imageUrl) {
        return json({
          visualDescription: null,
          visualAnchor: null,
          model: configuredVlmModel(),
          timedOut: false,
          persona: personaDto(persona),
        });
      }

      const started = Date.now();
      const analysis = await analyzePersonaImage(imageUrl);
      const timedOut = !analysis.visualDescription && !analysis.visualAnchor && Date.now() - started >= 19_000;

      const saved = await prisma.persona.update({
        where: { id: persona.id },
        data: {
          visualDescription: analysis.visualDescription || null,
          visualAnchor: analysis.visualAnchor || null,
          visualAnalyzedFor: analysis.visualDescription || analysis.visualAnchor ? imageUrl : '',
          // Keep legacy snapshot in sync with the compressed anchor when available.
          avatarSnapshot: analysis.visualAnchor || persona.avatarSnapshot || '',
          avatarSnapshotFor: analysis.visualAnchor ? imageUrl : persona.avatarSnapshotFor,
          ...(imageUrlOverride ? { avatar: imageUrlOverride } : {}),
        },
      });
      void syncPersonaToCloud(saved, viewer.user);

      return json({
        visualDescription: saved.visualDescription,
        visualAnchor: saved.visualAnchor,
        model: configuredVlmModel(),
        timedOut,
        persona: personaDto(saved),
      });
    }

    if (characterId) {
      const character = await prisma.character.findFirst({
        where: viewer.isCreatorAdmin
          ? { id: characterId }
          : { id: characterId, ownerId: viewer.user.id },
      });
      if (!character) return json({ error: 'Character not found' }, 404);
      const imageUrl = imageUrlOverride || character.avatar || '';
      if (!imageUrl) {
        return json({ visualDescription: null, visualAnchor: null, model: configuredVlmModel(), timedOut: false });
      }

      const started = Date.now();
      const analysis = await analyzePersonaImage(imageUrl);
      const timedOut = !analysis.visualDescription && !analysis.visualAnchor && Date.now() - started >= 19_000;
      const saved = await prisma.character.update({
        where: { id: character.id },
        data: {
          visualDescription: analysis.visualDescription || null,
          visualAnchor: analysis.visualAnchor || null,
          visualAnalyzedFor: analysis.visualDescription || analysis.visualAnchor ? imageUrl : '',
        },
      });
      return json({
        visualDescription: saved.visualDescription,
        visualAnchor: saved.visualAnchor,
        model: configuredVlmModel(),
        timedOut,
        characterId: saved.id,
      });
    }

    // Stateless analysis (preview) — analyze URL only, do not persist.
    if (!imageUrlOverride) return json({ error: 'personaId, characterId, or imageUrl required' }, 400);
    const started = Date.now();
    const analysis = await analyzePersonaImage(imageUrlOverride);
    const timedOut = !analysis.visualDescription && !analysis.visualAnchor && Date.now() - started >= 19_000;
    return json({
      visualDescription: analysis.visualDescription || null,
      visualAnchor: analysis.visualAnchor || null,
      model: configuredVlmModel(),
      timedOut,
    });
  } catch (err) {
    console.error('POST /api/vision/analyze-persona error:', err);
    return json({
      error: 'Vision analysis failed',
      visualDescription: null,
      visualAnchor: null,
      timedOut: true,
    }, 504);
  }
}
