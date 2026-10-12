'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';

const POLL_MS = 8000;

/** Polls the shared server and tells open screens when characters, chats, or messages change. */
export function LiveSync() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancel = false;
    let seen = '';

    async function tick() {
      const response = await fetch('/api/cloud/revision', { cache: 'no-store' });
      if (!response.ok || cancel) return;
      const body = await response.json().catch(() => null);
      const revision = typeof body?.revision === 'string' ? body.revision : '';
      if (!revision || revision === 'signed-out') return;
      if (seen && seen !== revision) {
        window.dispatchEvent(new CustomEvent('nexus:cloud-revision'));
      }
      seen = revision;
    }

    void tick();
    const timer = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [status]);

  return null;
}
