'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase/browser';

const DRAFT_KEY = 'nexus:character-draft:v1';
const TABLES = ['characters', 'scenarios', 'chats', 'chat_messages', 'personas'] as const;

/** Keeps a realtime socket open and copies cloud changes back into the local app. */
export function CloudSync() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancel = false;
    let seen = '';
    async function tick() {
      try {
        const response = await fetch('/api/cloud/revision', { cache: 'no-store' });
        if (!response.ok || cancel) return;
        const body = await response.json().catch(() => null);
        const revision = typeof body?.revision === 'string' ? body.revision : '';
        if (!revision || revision === 'signed-out') return;
        if (seen && seen !== revision) {
          window.dispatchEvent(new Event('nexus:cloud-revision'));
        }
        seen = revision;
      } catch (error) {
        console.log(`Cloud revision check failed: ${error}`);
      }
    }
    void tick();
    const timer = window.setInterval(() => void tick(), 8000);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const client = supabaseBrowser();
    if (!client) return;
    let cancel = false;
    let channel: RealtimeChannel | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let generation = 0;
    let attempt = 0;

    async function applyLive(table: string, record: Record<string, unknown> | null, deleted = false) {
      if (!record || cancel) return;
      try {
        const response = await fetch('/api/supabase/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table, record, deleted }),
        });
        if (!response.ok || cancel) return;
        window.dispatchEvent(new CustomEvent('nexus:cloud-sync', {
          detail: { table, localId: String(record.local_id ?? '') },
        }));
      } catch (error) {
        console.log(`Cloud apply failed: ${error}`);
      }
    }

    function connect() {
      if (cancel) return;
      const gen = ++generation;
      if (retry) clearTimeout(retry);
      if (channel) void client!.removeChannel(channel);
      const next = client!.channel(`nexus-live-${gen}`);
      channel = next;
      for (const table of TABLES) {
        next.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
          if (payload.eventType === 'DELETE') {
            void applyLive(table, (payload.old ?? null) as Record<string, unknown> | null, true);
            return;
          }
          void applyLive(table, (payload.new ?? null) as Record<string, unknown> | null);
        });
      }
      next.subscribe((nextStatus) => {
        if (cancel || gen !== generation) return;
        if (nextStatus === 'SUBSCRIBED') {
          attempt = 0;
          return;
        }
        if (nextStatus === 'CHANNEL_ERROR' || nextStatus === 'TIMED_OUT' || nextStatus === 'CLOSED') {
          attempt += 1;
          retry = setTimeout(connect, Math.min(1000 * 2 ** Math.max(attempt - 1, 0), 15000));
        }
      });
    }

    (async () => {
      const response = await fetch('/api/supabase/session');
      if (!response.ok || cancel) return;
      const body = await response.json().catch(() => null);
      if (!body?.access_token || !body?.refresh_token || cancel) return;
      const { data } = await client.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });
      const userId = data.session?.user.id;
      if (!userId || cancel) return;
      void fetch('/api/supabase/pull');
      connect();

      let draft: Record<string, unknown> | null = null;
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        draft = raw ? JSON.parse(raw) as Record<string, unknown> : null;
      } catch {
        draft = null;
      }
      if (!draft) return;
      const name = String(draft.name ?? '').trim();
      const scenario = String(draft.scenario ?? '');
      if (!name && !scenario.trim()) return;
      const localId = `draft:${userId}`;
      await client.from('characters').upsert({
        local_id: localId,
        user_id: userId,
        name: name || 'Draft',
        title: String(draft.title ?? ''),
        summary: String(draft.summary ?? ''),
        personality: String(draft.personality ?? ''),
        scenario,
        greeting: String(draft.firstMessage ?? draft.initialMessage ?? ''),
        tags: Array.isArray(draft.tags) ? draft.tags.join(', ') : String(draft.tags ?? ''),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'local_id' });
      await client.from('scenarios').upsert({
        local_id: `${localId}:scenario`,
        user_id: userId,
        character_local_id: localId,
        title: name || 'Draft scenario',
        body: scenario,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'local_id' });
    })().catch(() => {
      // The local copy stays in use when the cloud socket cannot connect.
    });

    return () => {
      cancel = true;
      generation += 1;
      if (retry) clearTimeout(retry);
      if (channel) void client.removeChannel(channel);
    };
  }, [status]);

  return null;
}
