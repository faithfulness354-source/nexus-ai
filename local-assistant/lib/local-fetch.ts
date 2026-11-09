/** Fetch a local server with a clear offline error. Never throws opaque network failures. */
export async function fetchLocal(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(120_000),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown network error';
    throw new Error(
      `Local server unreachable (${url}). Is it running? ${message}`,
    );
  }
}

export function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}
