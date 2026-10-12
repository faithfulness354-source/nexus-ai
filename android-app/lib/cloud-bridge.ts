'use client';

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
  if (typeof window === 'undefined') return '';
  return (window as Window & { __NEXUS_API_ORIGIN?: string }).__NEXUS_API_ORIGIN ?? '';
}

/** Sends the phone app's /api and /uploads calls to the same Next.js server the browser uses. */
export function installCloudBridge() {
  if (typeof window === 'undefined') return;
  const flag = '__nexusCloudBridge';
  const target = window as Window & { __nexusCloudBridge?: boolean; __NEXUS_API_ORIGIN?: string };
  if (target[flag]) return;
  target[flag] = true;
  const original = window.fetch.bind(window);
  let originReady: Promise<string> | null = null;

  function loadOrigin(): Promise<string> {
    if (target.__NEXUS_API_ORIGIN) return Promise.resolve(target.__NEXUS_API_ORIGIN);
    if (!originReady) {
      originReady = original('/nexus-cloud.json', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : {}))
        .then((data) => {
          const origin = typeof data?.origin === 'string' ? data.origin.trim().replace(/\/$/, '') : '';
          target.__NEXUS_API_ORIGIN = origin;
          return origin;
        })
        .catch(() => '');
    }
    return originReady;
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.includes('/nexus-cloud.json')) return original(input, init);
    const origin = await loadOrigin();
    const sameHost = url.startsWith('/api/') || url.startsWith('/uploads/');
    const nextUrl = origin && sameHost ? `${origin}${url}` : url;
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
