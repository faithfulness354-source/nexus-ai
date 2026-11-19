export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getViewer, unauthorized, forbidden } from '@/lib/access';
import { prisma } from '@/lib/db';
import { syncCharacterToCloud } from '@/lib/supabase/sync';
import { rateCharacterContent, sfwViolationResponse } from '@/lib/content-rating';
import {
  SFW_BATCH_CARDS,
  assertSfwBatchRoster,
  sfwBatchCreatorNotes,
  sfwBatchExampleDialogue,
  sfwBatchSystemPrompt,
} from '@/src/config/sfw-batch-roster';
import { SFW_BATCH_GENRE_LABEL } from '@/src/config/sfw-batch-genres';
import { customRulesJson } from '@/src/config/card-pipeline';

/**
 * Admin-only: upsert a controlled slice of the 50 SFW batch cards (text + existing avatars).
 * Body: { from?: number, to?: number, batchSize?: number }
 * Does not wipe other characters. Image generation stays on the CLI script (fal/Comfy).
 */
export async function POST(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  if (!viewer.isAdmin && !viewer.isCreatorAdmin) return forbidden('Admin only.');

  try {
    assertSfwBatchRoster();
    const body = await request.json().catch(() => ({}));
    const from = Math.max(1, Number(body?.from) || 1);
    const batchSize = Math.max(1, Math.min(20, Number(body?.batchSize) || 5));
    const to = Math.min(50, Number(body?.to) || from + batchSize - 1);
    const slice = SFW_BATCH_CARDS.filter((c) => c.batchIndex >= from && c.batchIndex <= to);

    const results: Array<{ id: string; name: string; genre: string; ok: boolean; error?: string }> = [];

    for (const card of slice) {
      const summary = `${card.profile_summary}\n\n${card.bio}`;
      const personality = `${card.personality}\n\nSayings:\n- ${card.sayings.join('\n- ')}`;
      const rating = rateCharacterContent({
        name: card.name,
        title: card.title,
        summary,
        personality,
        scenario: card.scenario,
        initialMessage: card.greeting,
        exampleDialogue: sfwBatchExampleDialogue(card),
        creatorNotes: sfwBatchCreatorNotes(card),
        systemPrompt: sfwBatchSystemPrompt(card),
        tags: card.tags,
        attire: card.attire,
      });
      if (rating.isNsfw) {
        results.push({ id: card.id, name: card.name, genre: card.genre, ok: false, error: 'SFW_VIOLATION' });
        // Do not write this card.
        continue;
      }

      const lane =
        card.genre === 'cyberpunk' ? 'cyberpunk'
          : card.genre === 'isekai' ? 'isekai'
            : card.genre === 'slice_of_life' || card.genre === 'academy_life' ? 'cozy'
              : 'high-fantasy';

      const existing = await prisma.character.findUnique({ where: { id: card.id }, select: { avatar: true } });
      const data = {
        name: card.name,
        title: card.title,
        summary,
        personality,
        scenario: card.scenario,
        initialMessage: card.greeting,
        exampleDialogue: sfwBatchExampleDialogue(card),
        customRules: customRulesJson(lane, false),
        systemPrompt: sfwBatchSystemPrompt(card),
        creatorNotes: sfwBatchCreatorNotes(card),
        tags: `${card.tags}, ${SFW_BATCH_GENRE_LABEL[card.genre]}`,
        avatar: existing?.avatar ?? null,
        nsfw: false,
        creator: 'Nexus AI',
        ownerId: viewer.user.id,
        visibility: 'PUBLIC' as const,
        moderated: false,
      };

      const saved = await prisma.character.upsert({
        where: { id: card.id },
        update: data,
        create: { id: card.id, ...data },
      });

      try {
        await syncCharacterToCloud(saved, viewer.user);
      } catch (err) {
        results.push({
          id: card.id,
          name: card.name,
          genre: card.genre,
          ok: false,
          error: err instanceof Error ? err.message : 'cloud sync failed',
        });
        continue;
      }

      results.push({ id: card.id, name: card.name, genre: card.genre, ok: true });
    }

    const blocked = results.filter((r) => !r.ok && r.error === 'SFW_VIOLATION');
    if (blocked.length && results.every((r) => !r.ok)) {
      return sfwViolationResponse(rateCharacterContent({ summary: 'blocked batch' }));
    }

    return NextResponse.json({
      from,
      to,
      processed: results.length,
      ok: results.filter((r) => r.ok).length,
      results,
      message: 'Upserted SFW batch slice without wiping other characters.',
    });
  } catch (err: any) {
    console.error('POST /api/admin/batch-sfw-cards error:', err);
    return NextResponse.json({ error: err?.message ?? 'Batch failed' }, { status: 500 });
  }
}

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  if (!viewer.isAdmin && !viewer.isCreatorAdmin) return forbidden('Admin only.');
  assertSfwBatchRoster();
  return NextResponse.json({
    total: SFW_BATCH_CARDS.length,
    genres: Object.fromEntries(
      (['slice_of_life', 'academy_life', 'fantasy_academy_life', 'swords_and_sorcery', 'isekai', 'cyberpunk'] as const)
        .map((g) => [g, SFW_BATCH_CARDS.filter((c) => c.genre === g).length]),
    ),
    cards: SFW_BATCH_CARDS.map((c) => ({
      id: c.id,
      batchIndex: c.batchIndex,
      name: c.name,
      title: c.title,
      genre: c.genre,
      rating: c.rating,
      is_nsfw: c.is_nsfw,
    })),
  });
}
