'use client';

import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';
import { AccessProvider } from '@/components/billing/access-provider';
import { CloudSync } from '@/components/supabase/cloud-sync';
import { MobileKeyboardInset } from '@/components/mobile-keyboard-inset';

const SESSION_PATH = '/api/auth/session';
/** Collapses the mount burst from NextAuth's broadcast listener into one request. */
const SESSION_CACHE_MS = 2000;

let cachedSession: { at: number; status: number; body: string } | null = null;
let pendingSession: Promise<{ status: number; body: string }> | null = null;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** One in-flight GET /api/auth/session, reused for a short window. Sign-in and sign-out clear it. */
function installSessionFetchCache() {
  if (typeof window === 'undefined') return;
  const flag = '__nexusSessionFetchCache';
  const target = window as Window & { __nexusSessionFetchCache?: boolean };
  if (target[flag]) return;
  target[flag] = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (url.includes('/api/auth/') && method !== 'GET') {
      cachedSession = null;
      pendingSession = null;
    }
    if (!url.includes(SESSION_PATH) || method !== 'GET') return original(input, init);

    const now = Date.now();
    if (cachedSession && now - cachedSession.at < SESSION_CACHE_MS) {
      return new Response(cachedSession.body, {
        status: cachedSession.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (!pendingSession) {
      pendingSession = original(input, init)
        .then(async (response) => {
          const body = await response.text();
          const result = { status: response.status, body };
          if (response.ok) cachedSession = { at: Date.now(), ...result };
          pendingSession = null;
          return result;
        })
        .catch((error) => {
          pendingSession = null;
          throw error;
        });
    }
    const result = await pendingSession;
    return new Response(result.body, {
      status: result.status,
      headers: { 'content-type': 'application/json' },
    });
  };
}

export function Providers({ children, session }: { children: React.ReactNode; session: Session | null }) {
  installSessionFetchCache();
  return (
    <SessionProvider session={session} refetchInterval={0} refetchOnWindowFocus={false}>
      <AccessProvider>
        <CloudSync />
        <MobileKeyboardInset />
        {children}
      </AccessProvider>
    </SessionProvider>
  );
}
