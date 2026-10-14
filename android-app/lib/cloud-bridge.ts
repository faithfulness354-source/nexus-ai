'use client';

import { liveApiUrl } from './api';

const TOKEN_KEY = 'nexus:cloud-token';

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function cloudToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberCloudToken(token: string) {
  if (!token) return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearCloudToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function apiOrigin(): string {
  return liveApiUrl();
}

function localApi(url: string): boolean {
  if (url.startsWith('/api/') || url.startsWith('/uploads/')) return true;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '10.0.2.2' || host.startsWith('192.168.');
  } catch {
    return false;
  }
}

function retarget(url: string, origin: string): string {
  if (url.includes('/nexus-cloud.json') || url.includes('/nexus-bridge.js')) return url;
  if (!origin || !localApi(url)) return url;
  if (url.startsWith('/api/') || url.startsWith('/uploads/')) return `${origin}${url}`;
  const path = new URL(url).pathname + new URL(url).search;
  return `${origin}${path}`;
}

/** Sends the phone app's /api and /uploads calls to the live Next.js server. */
export function installCloudBridge() {
  if (typeof window === 'undefined') return;
  const flag = '__nexusCloudBridge';
  const target = window as Window & { __nexusCloudBridge?: boolean; __NEXUS_API_ORIGIN?: string };
  if (target[flag]) return;
  target[flag] = true;
  const original = window.fetch.bind(window);

  function loadOrigin(): Promise<string> {
    const origin = liveApiUrl();
    target.__NEXUS_API_ORIGIN = origin;
    return Promise.resolve(origin);
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.includes('/nexus-cloud.json')) return original(input, init);
    const origin = await loadOrigin();
    const nextUrl = retarget(url, origin);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const token = cloudToken();
    if (token && nextUrl.includes('/api/') && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    if (input instanceof Request && nextUrl !== url) {
      const request = new Request(nextUrl, input);
      headers.forEach((value, key) => request.headers.set(key, value));
      return original(request, init);
    }
    return original(nextUrl, { ...init, headers });
  };
}
