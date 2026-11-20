/**
 * Venice.ai image generation client.
 * POST https://api.venice.ai/api/v1/image/generate with Bearer VENICE_API_KEY.
 */
import {
  VENICE_DEFAULT_BASE_URL,
  VENICE_DEFAULT_IMAGE_MODEL,
  VENICE_IMAGE_GENERATE_PATH,
  VENICE_IMAGES_GENERATIONS_PATH,
  VENICE_MAX_DIMENSION,
  VENICE_MAX_RETRIES,
  VENICE_REQUEST_TIMEOUT_MS,
  VENICE_RETRY_BASE_DELAY_MS,
} from '@/lib/venice-config';

export class VeniceApiError extends Error {
  readonly code: 'config' | 'http' | 'timeout' | 'invalid' | 'unknown';
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    opts: {
      code: VeniceApiError['code'];
      status?: number;
      retryable?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'VeniceApiError';
    this.code = opts.code;
    this.status = opts.status;
    this.retryable = Boolean(opts.retryable);
  }
}

export type VeniceGenerateArgs = {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg_scale?: number;
  model?: string;
  /** Optional style / reference image (raw base64, no data-URL prefix). */
  style_image?: string | null;
  style_strength?: number;
  format?: 'png' | 'webp' | 'jpeg';
  safe_mode?: boolean;
  seed?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getVeniceApiKey(): string {
  const key = (process.env.VENICE_API_KEY || '').trim();
  if (!key) {
    throw new VeniceApiError(
      'VENICE_API_KEY is not set. Add it to local-assistant/.env.local and restart the Next server.',
      { code: 'config', retryable: false },
    );
  }
  return key;
}

export function getVeniceBaseUrl(): string {
  return trimSlash((process.env.VENICE_BASE_URL || VENICE_DEFAULT_BASE_URL).trim() || VENICE_DEFAULT_BASE_URL);
}

export function getVeniceImageModel(override?: string): string {
  const fromEnv = (process.env.VENICE_IMAGE_MODEL || '').trim();
  const fromArg = typeof override === 'string' ? override.trim() : '';
  return fromArg || fromEnv || VENICE_DEFAULT_IMAGE_MODEL;
}

function clampDimension(value: number | undefined, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(VENICE_MAX_DIMENSION, Math.max(64, n));
}

function stripDataUrl(base64OrDataUrl: string): string {
  const trimmed = base64OrDataUrl.trim();
  const comma = trimmed.indexOf(',');
  if (trimmed.startsWith('data:') && comma >= 0) return trimmed.slice(comma + 1);
  return trimmed;
}

function mimeForFormat(format: 'png' | 'webp' | 'jpeg'): string {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}

function parseVeniceImage(payload: unknown, format: 'png' | 'webp' | 'jpeg'): string {
  // Native /image/generate → { images: ["base64…"] }
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.images) && typeof obj.images[0] === 'string' && obj.images[0]) {
      return stripDataUrl(obj.images[0]);
    }
    // OpenAI-compatible /images/generations → { data: [{ b64_json }] }
    if (Array.isArray(obj.data) && obj.data[0] && typeof obj.data[0] === 'object') {
      const first = obj.data[0] as Record<string, unknown>;
      if (typeof first.b64_json === 'string' && first.b64_json) return stripDataUrl(first.b64_json);
      if (typeof first.url === 'string' && first.url.startsWith('data:')) return stripDataUrl(first.url);
    }
  }
  throw new VeniceApiError(`Venice returned no image data (expected ${format} base64)`, {
    code: 'invalid',
    retryable: false,
  });
}

async function postVeniceJson(
  path: string,
  body: Record<string, unknown>,
  apiKey: string,
): Promise<{ status: number; json: unknown; text: string }> {
  const url = `${getVeniceBaseUrl()}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(VENICE_REQUEST_TIMEOUT_MS),
  });
  const text = await res.text().catch(() => '');
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: res.status, json, text };
}

function errorMessageFromBody(json: unknown, fallback: string): string {
  if (!json || typeof json !== 'object') return fallback;
  const obj = json as Record<string, unknown>;
  if (typeof obj.error === 'string' && obj.error.trim()) return obj.error;
  if (obj.error && typeof obj.error === 'object') {
    const nested = obj.error as Record<string, unknown>;
    if (typeof nested.message === 'string') return nested.message;
  }
  if (typeof obj.message === 'string' && obj.message.trim()) return obj.message;
  return fallback;
}

/**
 * Generate an image via Venice native POST /image/generate.
 * Falls back once to OpenAI-compatible POST /images/generations if the native path 404s.
 */
export async function veniceGenerateImage(args: VeniceGenerateArgs): Promise<{
  image: string;
  mimeType: string;
  model: string;
  api: string;
  seed: number;
}> {
  const apiKey = getVeniceApiKey();
  const model = getVeniceImageModel(args.model);
  const format = args.format || 'png';
  const width = clampDimension(args.width, 1024);
  const height = clampDimension(args.height, 1024);
  const seed =
    typeof args.seed === 'number' && Number.isFinite(args.seed)
      ? Math.trunc(args.seed)
      : Math.floor(Math.random() * 999_999_999) + 1;

  const nativePayload: Record<string, unknown> = {
    model,
    prompt: args.prompt,
    negative_prompt: args.negative_prompt || undefined,
    width,
    height,
    steps: typeof args.steps === 'number' ? args.steps : undefined,
    cfg_scale: typeof args.cfg_scale === 'number' ? args.cfg_scale : undefined,
    format,
    return_binary: false,
    hide_watermark: true,
    safe_mode: args.safe_mode === true, // default false for uncensored assistant use
    seed,
    variants: 1,
    enhance_prompt: false,
  };

  if (args.style_image) {
    nativePayload.style_references = [
      {
        image: args.style_image,
        strength: Math.min(1, Math.max(0.1, args.style_strength ?? 0.65)),
      },
    ];
  }

  // Drop undefined keys so Venice does not 400 on unexpected nulls.
  for (const key of Object.keys(nativePayload)) {
    if (nativePayload[key] === undefined) delete nativePayload[key];
  }

  let lastError: VeniceApiError | null = null;
  let useOpenAiCompat = false;

  for (let attempt = 0; attempt <= VENICE_MAX_RETRIES; attempt += 1) {
    try {
      const path = useOpenAiCompat ? VENICE_IMAGES_GENERATIONS_PATH : VENICE_IMAGE_GENERATE_PATH;
      const payload = useOpenAiCompat
        ? {
            model,
            prompt: args.prompt,
            size: `${width}x${height}`,
            response_format: 'b64_json',
            n: 1,
          }
        : nativePayload;

      const { status, json, text } = await postVeniceJson(path, payload, apiKey);

      if (status === 404 && !useOpenAiCompat) {
        useOpenAiCompat = true;
        continue;
      }

      if (status === 401 || status === 403) {
        throw new VeniceApiError(
          errorMessageFromBody(json, `Venice auth failed (${status}). Check VENICE_API_KEY.`),
          { code: 'http', status, retryable: false },
        );
      }

      if (status === 429 || status === 503 || status >= 500) {
        throw new VeniceApiError(errorMessageFromBody(json, `Venice temporary error ${status}`), {
          code: 'http',
          status,
          retryable: true,
        });
      }

      if (status < 200 || status >= 300) {
        throw new VeniceApiError(errorMessageFromBody(json, text || `Venice error ${status}`), {
          code: 'http',
          status,
          retryable: false,
        });
      }

      const image = parseVeniceImage(json, format);
      return {
        image,
        mimeType: mimeForFormat(format),
        model,
        api: `${getVeniceBaseUrl()}${path}`,
        seed,
      };
    } catch (err: unknown) {
      if (err instanceof VeniceApiError) {
        lastError = err;
      } else {
        const message = err instanceof Error ? err.message : String(err);
        const timedOut = /aborted|timeout|TimeoutError/i.test(message);
        lastError = new VeniceApiError(
          timedOut
            ? `Venice request timed out after ${VENICE_REQUEST_TIMEOUT_MS / 1000}s`
            : `Venice request failed: ${message}`,
          { code: timedOut ? 'timeout' : 'unknown', retryable: true, cause: err },
        );
      }
      if (!lastError.retryable || attempt === VENICE_MAX_RETRIES) throw lastError;
      await sleep(VENICE_RETRY_BASE_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError || new VeniceApiError('Venice image generation failed', { code: 'unknown' });
}
