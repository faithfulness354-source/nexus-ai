export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { normalizeCard } from '@/lib/card-parser';
import { ImportError, ImportResult, importFromUrl, parseCardBytes, storeAvatar } from '@/lib/card-import-server';
import { getViewer, unauthorized, can, canViewNsfw, nsfwLocked } from '@/lib/access';

const MAX_UPLOAD = 15 * 1024 * 1024;

/**
 * Imports a character from:
 *  - multipart `file`: card .png (chara / ccv3 / character tEXt·zTXt·iTXt chunk) or .json
 *  - JSON `{ url }`: Chub / Janitor AI / Character Tavern link or direct card URL
 *  - JSON `{ text }` or a raw card object: pasted Tavern V1, Card V2/V3, Chub or Janitor JSON
 */
export async function POST(request: NextRequest) {
  try {
    const viewer = await getViewer();
    if (!viewer) return unauthorized();

    let result: ImportResult;
    if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) throw new ImportError('No file was uploaded.');
      if (file.size > MAX_UPLOAD) throw new ImportError('That file is larger than 15 MB.');
      result = parseCardBytes(Buffer.from(await file.arrayBuffer()), file.name);
    } else {
      const body = await request.json().catch(() => null);
      if (!body) throw new ImportError('Nothing to import.');
      if (typeof body.url === 'string' && body.url.trim()) result = await importFromUrl(body.url);
      else if (typeof body.text === 'string') result = parseCardBytes(Buffer.from(body.text, 'utf8'), 'Pasted text');
      else result = { card: normalizeCard(body), avatarPng: null, source: 'Pasted JSON' };
    }

    const { card } = result;
    if (card.nsfw && !canViewNsfw(viewer)) return nsfwLocked();
    const avatar = await storeAvatar(result.avatarPng, card.name).catch((err) => {
      console.error('Avatar upload failed during import:', err);
      return null;
    });

    const character = await prisma.character.create({
      data: {
        ownerId: viewer.user.id,
        name: card.name,
        title: card.title,
        summary: card.summary,
        personality: card.personality,
        scenario: card.scenario,
        initialMessage: card.initialMessage,
        exampleDialogue: card.exampleDialogue,
        customRules: '{"meters":[],"rules":[]}',
        systemPrompt: can(viewer, 'customPrompts') ? card.systemPrompt : '',
        creatorNotes: card.creatorNotes,
        tags: card.tags,
        avatar,
        creator: card.creator,
        nsfw: card.nsfw,
        visibility: 'PRIVATE',
        moderated: false,
      },
    });
    return NextResponse.json(
      {
        ...character,
        importReport: {
          source: result.source,
          avatar: !!avatar,
          filled: {
            definition: !!card.personality, scenario: !!card.scenario, initialMessage: !!card.initialMessage,
            exampleDialogue: !!card.exampleDialogue, tags: card.tags.length,
          },
        },
      },
      { status: 201 },
    );
  } catch (err: any) {
    if (err instanceof ImportError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err?.message?.startsWith('No character name') || err?.message?.startsWith('Card data')) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('Import error:', err);
    return NextResponse.json({ error: err?.name === 'TimeoutError' ? 'The site took too long to respond.' : 'Failed to import this character.' }, { status: 500 });
  }
}
