/**
 * Fetch a local server with clearer offline vs timeout errors.
 * Default timeout is 120s; Forge img2img overrides to 180s via AbortSignal.
 */
export async function fetchLocal(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(120_000),
    });
  } catch (err: unknown) {
    const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name) : '';
    const message = err instanceof Error ? err.message : 'Unknown network error';
    if (name === 'AbortError' || /aborted|timeout|TimeoutError/i.test(message)) {
      const timeoutErr = new Error(`Local request timed out (${url}). ${message}`);
      timeoutErr.name = 'AbortError';
      throw timeoutErr;
    }
    throw new Error(`Local server unreachable (${url}). Is it running? ${message}`);
  }
}

export function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}
