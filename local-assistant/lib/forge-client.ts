/**
 * Hardened Stable Diffusion Forge bridge client.
 * Readiness probe → long timeout → automatic retries for transient local failures.
 */
import {
  FORGE_DEFAULT_BASE_URL,
  FORGE_IMG2IMG_PATH,
  FORGE_MAX_RETRIES,
  FORGE_PROGRESS_PATH,
  FORGE_READY_POLL_MS,
  FORGE_READY_WAIT_MS,
  FORGE_REQUEST_TIMEOUT_MS,
  FORGE_RETRY_BASE_DELAY_MS,
  FORGE_TXT2IMG_PATH,
} from '@/lib/forge-config';
import { fetchLocal, trimSlash } from '@/lib/local-fetch';

export class ForgeBridgeError extends Error {
  readonly code: 'offline' | 'timeout' | 'http' | 'invalid' | 'unknown';
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    opts: {
      code: ForgeBridgeError['code'];
      status?: number;
      retryable?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'ForgeBridgeError';
    this.code = opts.code;
    this.status = opts.status;
    this.retryable = Boolean(opts.retryable);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err ? String((err as { name?: unknown }).name) : '';
  const message = err instanceof Error ? err.message : String(err);
  return name === 'AbortError' || /aborted|timeout|TimeoutError/i.test(message);
}

function isOfflineError(err: unknown): boolean {
  if (err instanceof ForgeBridgeError) return err.code === 'offline';
  const message = err instanceof Error ? err.message : String(err);
  return /unreachable|ECONNREFUSED|ECONNRESET|ENOTFOUND|fetch failed|network|socket/i.test(message);
}

function classifyFetchError(err: unknown, url: string): ForgeBridgeError {
  if (err instanceof ForgeBridgeError) return err;
  if (isAbortError(err)) {
    return new ForgeBridgeError(
      `Forge request timed out after ${FORGE_REQUEST_TIMEOUT_MS / 1000}s (${url}). The local RTX 4050 job may still be running — retry shortly.`,
      { code: 'timeout', retryable: true, cause: err },
    );
  }
  if (isOfflineError(err)) {
    return new ForgeBridgeError(
      `Forge is not reachable at ${url}. Start Stable Diffusion Forge (port 7860) or run npm run forge:ensure.`,
      { code: 'offline', retryable: true, cause: err },
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return new ForgeBridgeError(message || 'Forge request failed', {
    code: 'unknown',
    retryable: true,
    cause: err,
  });
}

/** Single readiness probe — does not throw hard timeouts as "unreachable". */
export async function probeForgeReady(baseUrl = FORGE_DEFAULT_BASE_URL): Promise<boolean> {
  const root = trimSlash(baseUrl);
  try {
    const res = await fetchLocal(`${root}${FORGE_PROGRESS_PATH}?skip_current_image=true`, {
      method: 'GET',
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/**
 * Wait until Forge answers on the API, or throw a clear offline error.
 * Prefer this before long img2img POSTs so callers do not burn the 180s timeout.
 */
export async function ensureForgeReady(
  baseUrl = FORGE_DEFAULT_BASE_URL,
  waitMs = FORGE_READY_WAIT_MS,
): Promise<void> {
  const root = trimSlash(baseUrl);
  const deadline = Date.now() + waitMs;
  let attempt = 0;

  while (Date.now() <= deadline) {
    attempt += 1;
    if (await probeForgeReady(root)) return;
    if (Date.now() + FORGE_READY_POLL_MS > deadline) break;
    await sleep(FORGE_READY_POLL_MS);
  }

  throw new ForgeBridgeError(
    `Forge API at ${root} is not active after ${Math.round(waitMs / 1000)}s (${attempt} probes). ` +
      `Start it with npm run forge:ensure (or start-forge.bat) so :7860 is listening before generating.`,
    { code: 'offline', retryable: false },
  );
}

type ForgeFetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Override request timeout (default FORGE_REQUEST_TIMEOUT_MS = 180s). */
  timeoutMs?: number;
  retries?: number;
  /** When true (default), probe readiness before the first attempt. */
  ensureReady?: boolean;
};

/**
 * Fetch Forge with readiness gate, 180s timeout, and retries for transient failures.
 */
export async function forgeFetch(url: string, opts: ForgeFetchOptions = {}): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? FORGE_REQUEST_TIMEOUT_MS;
  const retries = opts.retries ?? FORGE_MAX_RETRIES;
  const ensureReady = opts.ensureReady !== false;

  let baseUrl = FORGE_DEFAULT_BASE_URL;
  try {
    const parsed = new URL(url);
    baseUrl = `${parsed.protocol}//${parsed.host}`;
  } catch {
    /* keep default */
  }

  let lastError: ForgeBridgeError | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      if (ensureReady || attempt > 0) {
        // On retries, allow a shorter ready wait so we recover from mid-boot races.
        const readyWait = attempt === 0 ? FORGE_READY_WAIT_MS : Math.min(30_000, FORGE_READY_WAIT_MS);
        await ensureForgeReady(baseUrl, readyWait);
      }

      const res = await fetchLocal(url, {
        method: opts.method || 'GET',
        headers: opts.headers,
        body: opts.body,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.status === 502 || res.status === 503 || res.status === 504) {
        const text = await res.text().catch(() => '');
        throw new ForgeBridgeError(
          `Forge temporary error ${res.status}: ${text || res.statusText}`,
          { code: 'http', status: res.status, retryable: true },
        );
      }

      return res;
    } catch (err: unknown) {
      lastError = classifyFetchError(err, url);
      const canRetry = lastError.retryable && attempt < retries;
      if (!canRetry) throw lastError;
      const delay = FORGE_RETRY_BASE_DELAY_MS * (attempt + 1);
      await sleep(delay);
    }
  }

  throw (
    lastError ||
    new ForgeBridgeError(`Forge request failed (${url})`, { code: 'unknown', retryable: false })
  );
}

/** Keys that must never leak into a fresh txt2img call. */
const TXT2IMG_STRIP_KEYS = [
  'init_images',
  'init_image',
  'denoising_strength',
  'image_cfg_scale',
  'mask',
  'mask_blur',
  'inpainting_fill',
  'inpaint_full_res',
  'inpaint_full_res_padding',
  'include_init_images',
  'resize_mode',
] as const;

/**
 * Disabled ControlNet unit — clears residual FaceID / IP-Adapter reference tensors
 * left behind by a prior img2img call in the same Forge process.
 */
export function clearedControlNetArgs(unitCount = 3): Record<string, unknown>[] {
  return Array.from({ length: unitCount }, () => ({
    enabled: false,
    module: 'none',
    model: 'None',
    weight: 0,
    image: null,
    input_image: null,
    resize_mode: 'Crop and Resize',
    lowvram: false,
    processor_res: 512,
    threshold_a: 0.5,
    threshold_b: 0.5,
    guidance_start: 0,
    guidance_end: 1,
    control_mode: 'Balanced',
    pixel_perfect: false,
  }));
}

/** Fresh random seed on every call (-1 tells Forge to pick a new seed). */
export function freshSeedFields(): { seed: number; subseed: number; subseed_strength: number; seed_resize_from_h: number; seed_resize_from_w: number } {
  return {
    seed: -1,
    subseed: -1,
    subseed_strength: 0,
    seed_resize_from_h: -1,
    seed_resize_from_w: -1,
  };
}

/**
 * Build a clean txt2img body: strip init images / masks / denoise, clear ControlNet refs, randomize seed.
 */
export function sanitizeTxt2ImgPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = { ...payload, ...freshSeedFields() };
  for (const key of TXT2IMG_STRIP_KEYS) {
    delete clean[key];
  }
  clean.alwayson_scripts = {
    controlnet: {
      args: clearedControlNetArgs(),
    },
  };
  return clean;
}

/**
 * Build a clean img2img body: require init_images, randomize seed, keep only intentional ControlNet.
 */
export function sanitizeImg2ImgPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = { ...payload, ...freshSeedFields() };
  const images = clean.init_images;
  if (!Array.isArray(images) || typeof images[0] !== 'string' || !images[0]) {
    throw new ForgeBridgeError('img2img requires init_images[0] base64 data', {
      code: 'invalid',
      retryable: false,
    });
  }
  // Drop accidental aliases that some clients send alongside init_images.
  delete clean.init_image;
  delete clean.style_image;
  return clean;
}

export async function forgeImg2Img(
  baseUrl: string,
  payload: Record<string, unknown>,
): Promise<{ image: string; raw: unknown }> {
  const root = trimSlash(baseUrl);
  const body = sanitizeImg2ImgPayload(payload);
  const res = await forgeFetch(`${root}${FORGE_IMG2IMG_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: FORGE_REQUEST_TIMEOUT_MS,
    ensureReady: true,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ForgeBridgeError(
      `Forge ${FORGE_IMG2IMG_PATH} ${res.status}: ${text || res.statusText}`,
      { code: 'http', status: res.status, retryable: res.status >= 500 },
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch (err) {
    throw new ForgeBridgeError('Forge returned invalid JSON for img2img', {
      code: 'invalid',
      retryable: true,
      cause: err,
    });
  }

  const images = (data as { images?: unknown })?.images;
  const image = Array.isArray(images) ? images[0] : null;
  if (typeof image !== 'string' || !image) {
    throw new ForgeBridgeError('Forge returned no image data', {
      code: 'invalid',
      retryable: false,
    });
  }

  return {
    image: image.includes(',') ? image.split(',').pop()! : image,
    raw: data,
  };
}

export async function forgeTxt2Img(
  baseUrl: string,
  payload: Record<string, unknown>,
): Promise<{ image: string; raw: unknown }> {
  const root = trimSlash(baseUrl);
  const body = sanitizeTxt2ImgPayload(payload);
  const res = await forgeFetch(`${root}${FORGE_TXT2IMG_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: FORGE_REQUEST_TIMEOUT_MS,
    ensureReady: true,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ForgeBridgeError(
      `Forge ${FORGE_TXT2IMG_PATH} ${res.status}: ${text || res.statusText}`,
      { code: 'http', status: res.status, retryable: res.status >= 500 },
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch (err) {
    throw new ForgeBridgeError('Forge returned invalid JSON for txt2img', {
      code: 'invalid',
      retryable: true,
      cause: err,
    });
  }

  const images = (data as { images?: unknown })?.images;
  const image = Array.isArray(images) ? images[0] : null;
  if (typeof image !== 'string' || !image) {
    throw new ForgeBridgeError('Forge returned no image data', {
      code: 'invalid',
      retryable: false,
    });
  }

  return {
    image: image.includes(',') ? image.split(',').pop()! : image,
    raw: data,
  };
}
