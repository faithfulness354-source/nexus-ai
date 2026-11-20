import { prisma } from '@/lib/db';
import type { Viewer } from '@/lib/access';

export type CommentKind = 'card' | 'profile';

export interface CommentRow {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  flagged: boolean;
  pinned: boolean;
  canDelete: boolean;
  canPin: boolean;
  canReport: boolean;
}

let ready: Promise<void> | null = null;

function ensureCommentTables(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await prisma.$executeRawUnsafe(`create extension if not exists pgcrypto`);
      await prisma.$executeRawUnsafe(`
        create table if not exists public.card_comments (
          id uuid primary key default gen_random_uuid(),
          card_id text not null,
          user_id text not null,
          author_name text not null default '',
          content text not null,
          created_at timestamptz not null default now()
        )
      `);
      await prisma.$executeRawUnsafe(`create index if not exists card_comments_card_idx on public.card_comments (card_id, created_at desc)`);
      await prisma.$executeRawUnsafe(`
        create table if not exists public.profile_comments (
          id uuid primary key default gen_random_uuid(),
          profile_id text not null,
          author_id text not null,
          author_name text not null default '',
          content text not null,
          created_at timestamptz not null default now()
        )
      `);
      await prisma.$executeRawUnsafe(`create index if not exists profile_comments_profile_idx on public.profile_comments (profile_id, created_at desc)`);
    })().catch((err) => {
      ready = null;
      console.warn('[comments] table check skipped:', err instanceof Error ? err.message : err);
    });
  }
  return ready;
}

export function cleanComment(value: unknown): string {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, 1000);
  if (!text || text.length > 1000) return '';
  return text;
}

function authorLabel(viewer: Viewer): string {
  const name = viewer.user.displayName?.trim() || viewer.user.username?.trim() || 'Creator';
  return name.slice(0, 80);
}

function canModerate(viewer: Viewer | null): boolean {
  return !!viewer && (viewer.isAdmin || viewer.isCreatorAdmin);
}

export async function listCardComments(cardId: string, viewer: Viewer | null, ownerId: string | null): Promise<CommentRow[]> {
  await ensureCommentTables();
  const rows = await prisma.$queryRaw<Array<{ id: string; user_id: string; author_name: string; content: string; created_at: Date; flagged: boolean; display_name: string | null; username: string | null }>>`
    SELECT c.id::text AS id, c.user_id, c.author_name, c.content, c.created_at, c.flagged, u."displayName" AS display_name, u.username
    FROM public.card_comments c
    LEFT JOIN nexus."User" u ON u.id = c.user_id
    WHERE c.card_id = ${cardId}
    ORDER BY c.created_at DESC
    LIMIT 80
  `;
  const owner = !!viewer && viewer.user.id === ownerId;
  return rows.map((row) => ({
    id: row.id,
    authorId: row.user_id,
    authorName: row.display_name?.trim() || row.username?.trim() || row.author_name || 'Creator',
    content: row.content,
    createdAt: new Date(row.created_at).toISOString(),
    flagged: row.flagged === true,
    pinned: false,
    canDelete: canModerate(viewer) || (!!viewer && (viewer.user.id === row.user_id || owner)),
    canPin: false,
    canReport: !!viewer && viewer.user.id !== row.user_id,
  }));
}

export async function listProfileComments(profileId: string, viewer: Viewer | null): Promise<CommentRow[]> {
  await ensureCommentTables();
  const rows = await prisma.$queryRaw<Array<{ id: string; author_id: string; author_name: string; content: string; created_at: Date; flagged: boolean; pinned: boolean; display_name: string | null; username: string | null }>>`
    SELECT c.id::text AS id, c.author_id, c.author_name, c.content, c.created_at, c.flagged, c.pinned, u."displayName" AS display_name, u.username
    FROM public.profile_comments c
    LEFT JOIN nexus."User" u ON u.id = c.author_id
    WHERE c.profile_id = ${profileId}
    ORDER BY c.pinned DESC, c.created_at DESC
    LIMIT 80
  `;
  const owner = !!viewer && viewer.user.id === profileId;
  return rows.map((row) => ({
    id: row.id,
    authorId: row.author_id,
    authorName: row.display_name?.trim() || row.username?.trim() || row.author_name || 'Creator',
    content: row.content,
    createdAt: new Date(row.created_at).toISOString(),
    flagged: row.flagged === true,
    pinned: row.pinned === true,
    canDelete: canModerate(viewer) || (!!viewer && (viewer.user.id === row.author_id || owner)),
    canPin: canModerate(viewer) || owner,
    canReport: !!viewer && viewer.user.id !== row.author_id,
  }));
}

export async function addCardComment(cardId: string, viewer: Viewer, content: string): Promise<void> {
  await ensureCommentTables();
  const name = authorLabel(viewer);
  await prisma.$executeRaw`
    INSERT INTO public.card_comments (card_id, user_id, author_name, content)
    VALUES (${cardId}, ${viewer.user.id}, ${name}, ${content})
  `;
}

export async function addProfileComment(profileId: string, viewer: Viewer, content: string): Promise<void> {
  await ensureCommentTables();
  const name = authorLabel(viewer);
  await prisma.$executeRaw`
    INSERT INTO public.profile_comments (profile_id, author_id, author_name, content)
    VALUES (${profileId}, ${viewer.user.id}, ${name}, ${content})
  `;
}

export async function deleteCardComment(commentId: string, viewer: Viewer, ownerId: string | null, cardId?: string): Promise<boolean> {
  await ensureCommentTables();
  const rows = await prisma.$queryRaw<Array<{ user_id: string; card_id: string }>>`
    SELECT user_id, card_id FROM public.card_comments WHERE id::text = ${commentId}
  `;
  const row = rows[0];
  if (!row || (cardId && row.card_id !== cardId)) return false;
  if (!canModerate(viewer) && viewer.user.id !== row.user_id && viewer.user.id !== ownerId) return false;
  await prisma.$executeRaw`DELETE FROM public.card_comments WHERE id::text = ${commentId}`;
  return true;
}

export async function deleteProfileComment(commentId: string, viewer: Viewer, profileId: string): Promise<boolean> {
  await ensureCommentTables();
  const rows = await prisma.$queryRaw<Array<{ author_id: string; profile_id: string }>>`
    SELECT author_id, profile_id FROM public.profile_comments WHERE id::text = ${commentId}
  `;
  const row = rows[0];
  if (!row || row.profile_id !== profileId) return false;
  if (!canModerate(viewer) && viewer.user.id !== row.author_id && viewer.user.id !== row.profile_id) return false;
  await prisma.$executeRaw`DELETE FROM public.profile_comments WHERE id::text = ${commentId}`;
  return true;
}

async function ownsComment(kind: CommentKind, commentId: string, targetId: string): Promise<{ authorId: string } | null> {
  if (kind === 'card') {
    const rows = await prisma.$queryRaw<Array<{ user_id: string; card_id: string }>>`
      SELECT user_id, card_id FROM public.card_comments WHERE id::text = ${commentId}
    `;
    const row = rows[0];
    if (!row || row.card_id !== targetId) return null;
    return { authorId: row.user_id };
  }
  const rows = await prisma.$queryRaw<Array<{ author_id: string; profile_id: string }>>`
    SELECT author_id, profile_id FROM public.profile_comments WHERE id::text = ${commentId}
  `;
  const row = rows[0];
  if (!row || row.profile_id !== targetId) return null;
  return { authorId: row.author_id };
}

export async function reportComment(kind: CommentKind, commentId: string, targetId: string, viewer: Viewer): Promise<boolean> {
  await ensureCommentTables();
  const row = await ownsComment(kind, commentId, targetId);
  if (!row || row.authorId === viewer.user.id) return false;
  if (kind === 'card') {
    await prisma.$executeRaw`UPDATE public.card_comments SET flagged = true WHERE id::text = ${commentId}`;
  } else {
    await prisma.$executeRaw`UPDATE public.profile_comments SET flagged = true WHERE id::text = ${commentId}`;
  }
  return true;
}

export async function pinProfileComment(commentId: string, profileId: string, viewer: Viewer, pinned: boolean): Promise<string | null> {
  await ensureCommentTables();
  if (!canModerate(viewer) && viewer.user.id !== profileId) return 'Only the profile owner can pin guestbook notes.';
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text AS id FROM public.profile_comments WHERE id::text = ${commentId} AND profile_id = ${profileId}
  `;
  if (!rows[0]) return 'That comment is not on this profile.';
  if (pinned) {
    const count = await prisma.$queryRaw<Array<{ total: number }>>`
      SELECT count(*)::int AS total FROM public.profile_comments WHERE profile_id = ${profileId} AND pinned = true AND id::text <> ${commentId}
    `;
    if (Number(count[0]?.total ?? 0) >= 2) return 'You can pin up to 2 guestbook notes.';
  }
  await prisma.$executeRaw`UPDATE public.profile_comments SET pinned = ${pinned} WHERE id::text = ${commentId}`;
  return null;
}
