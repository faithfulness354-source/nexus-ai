import { prisma } from '@/lib/db';
import type { Viewer } from '@/lib/access';

export type CommentKind = 'card' | 'profile';

export interface CommentRow {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  canDelete: boolean;
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
      throw err;
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
  const rows = await prisma.$queryRaw<Array<{ id: string; user_id: string; author_name: string; content: string; created_at: Date; display_name: string | null; username: string | null }>>`
    SELECT c.id::text AS id, c.user_id, c.author_name, c.content, c.created_at, u."displayName" AS display_name, u.username
    FROM public.card_comments c
    LEFT JOIN nexus."User" u ON u.id = c.user_id
    WHERE c.card_id = ${cardId}
    ORDER BY c.created_at DESC
    LIMIT 80
  `;
  return rows.map((row) => ({
    id: row.id,
    authorId: row.user_id,
    authorName: row.display_name?.trim() || row.username?.trim() || row.author_name || 'Creator',
    content: row.content,
    createdAt: new Date(row.created_at).toISOString(),
    canDelete: canModerate(viewer) || (!!viewer && (viewer.user.id === row.user_id || viewer.user.id === ownerId)),
  }));
}

export async function listProfileComments(profileId: string, viewer: Viewer | null): Promise<CommentRow[]> {
  await ensureCommentTables();
  const rows = await prisma.$queryRaw<Array<{ id: string; author_id: string; author_name: string; content: string; created_at: Date; display_name: string | null; username: string | null }>>`
    SELECT c.id::text AS id, c.author_id, c.author_name, c.content, c.created_at, u."displayName" AS display_name, u.username
    FROM public.profile_comments c
    LEFT JOIN nexus."User" u ON u.id = c.author_id
    WHERE c.profile_id = ${profileId}
    ORDER BY c.created_at DESC
    LIMIT 80
  `;
  return rows.map((row) => ({
    id: row.id,
    authorId: row.author_id,
    authorName: row.display_name?.trim() || row.username?.trim() || row.author_name || 'Creator',
    content: row.content,
    createdAt: new Date(row.created_at).toISOString(),
    canDelete: canModerate(viewer) || (!!viewer && (viewer.user.id === row.author_id || viewer.user.id === profileId)),
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

export async function deleteCardComment(commentId: string, viewer: Viewer, ownerId: string | null): Promise<boolean> {
  await ensureCommentTables();
  const rows = await prisma.$queryRaw<Array<{ user_id: string }>>`
    SELECT user_id FROM public.card_comments WHERE id::text = ${commentId}
  `;
  const row = rows[0];
  if (!row) return false;
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
