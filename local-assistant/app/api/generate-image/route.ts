import { NextRequest } from 'next/server';
import {
  COMFY_ANIME_CHECKPOINT_RE,
  COMFY_CLIP_VISION_H,
  COMFY_DEFAULT_BASE_URL,
  COMFY_DEFAULT_CHECKPOINT,
  COMFY_IPADAPTER_PLUS_SDXL,
  COMFY_IPADAPTER_WEIGHT,
  COMFY_IPADAPTER_WEIGHT_TYPE,
  COMFY_PREFERRED_CHECKPOINTS,
} from '@/lib/comfy-config';
import {
  forgeFetch,
  forgeImg2Img,
  forgeTxt2Img,
  ForgeBridgeError,
  freshSeedFields,
} from '@/lib/forge-client';
import {
  FORGE_DEFAULT_BASE_URL,
  FORGE_IMG2IMG_CFG,
  FORGE_IMG2IMG_DENOISE,
  FORGE_IMG2IMG_PATH,
  FORGE_IMG2IMG_SAMPLER,
  FORGE_IMG2IMG_STEPS,
  FORGE_IPADAPTER_MODEL,
  FORGE_IPADAPTER_MODULE,
  FORGE_IPADAPTER_WEIGHT,
  FORGE_PREFERRED_CHECKPOINT,
  FORGE_REQUEST_TIMEOUT_MS,
  FORGE_TXT2IMG_PATH,
} from '@/lib/forge-config';
import {
  STYLE_NEGATIVE_PROMPT,
  STYLE_POSITIVE_SUFFIX,
  buildPositiveConditioningText,
  expandWithStylePreset,
  lockImg2ImgDenoise,
} from '@/lib/image-style';
import { fetchLocal, trimSlash } from '@/lib/local-fetch';
import { veniceGenerateImage, VeniceApiError } from '@/lib/venice-client';
import { VENICE_DEFAULT_BASE_URL, VENICE_REQUEST_TIMEOUT_MS } from '@/lib/venice-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ImageBody = {
  prompt?: string;
  negative_prompt?: string;
  steps?: number;
  cfg_scale?: number;
  width?: number;
  height?: number;
  sampler_name?: string;
  denoise?: number;
  /**
   * Explicit generation mode. When omitted:
   * - img2img only if init_image is present AND mode is not forced to txt2img
   * - otherwise txt2img (never infer from leftover chat images)
   */
  mode?: 'txt2img' | 'img2img';
  /** Raw base64 or data-URL — required for img2img; ignored for txt2img. */
  init_image?: string;
  /** Optional separate style reference for IP-Adapter (ComfyUI). Ignored on Forge txt2img. */
  style_image?: string;
  /** Override IP-Adapter weight (defaults to 0.65). */
  ipadapter_weight?: number;
  checkpoint?: string;
  model?: string;
  /** Default: venice. Local Forge/Comfy only when explicitly requested. */
  backend?: 'venice' | 'a1111' | 'comfyui';
  a1111BaseUrl?: string;
  comfyBaseUrl?: string;
};

/**
 * Proxies image generation to Venice.ai by default
 * (POST https://api.venice.ai/api/v1/image/generate, Bearer VENICE_API_KEY).
 * Local Forge (:7860) / ComfyUI remain available when backend=a1111|comfyui is set.
 */
export async function POST(request: NextRequest) {
  let body: ImageBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawPrompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!rawPrompt) return Response.json({ error: 'prompt is required' }, { status: 400 });
  // Subject + locked 3D render style preset for positive conditioning.
  const prompt = buildPositiveConditioningText(expandWithStylePreset(rawPrompt));

  // Shared prompt/negative defaults (Venice + legacy local backends).
  const negative_prompt =
    typeof body.negative_prompt === 'string' && body.negative_prompt.trim()
      ? body.negative_prompt.trim()
      : STYLE_NEGATIVE_PROMPT;
  const width = clampInt(body.width, 1024, 64, 1280);
  const height = clampInt(body.height, 1024, 64, 1280);
  const steps = clampInt(body.steps, FORGE_IMG2IMG_STEPS, 1, 150);
  const cfg_scale = clampFloat(body.cfg_scale, FORGE_IMG2IMG_CFG, 1, 20);
  const sampler_name = FORGE_IMG2IMG_SAMPLER;
  const denoise = FORGE_IMG2IMG_DENOISE;
  // Default bridge target is Venice cloud API (no local Forge timeout/cache).
  const backend =
    body.backend === 'comfyui' || body.backend === 'a1111' || body.backend === 'venice'
      ? body.backend
      : 'venice';
  // Parse mode first so leftover init_image bytes cannot force img2img on a text-only request.
  const requestedMode = body.mode === 'img2img' || body.mode === 'txt2img' ? body.mode : null;
  const rawInit = normalizeBase64(body.init_image);
  const useImg2Img = requestedMode === 'img2img' || (requestedMode !== 'txt2img' && Boolean(rawInit));
  const init_image = useImg2Img ? rawInit : null;
  if (requestedMode === 'img2img' && !init_image) {
    return Response.json(
      { error: 'img2img mode requires init_image (base64 or data-URL)' },
      { status: 400 },
    );
  }
  // Style refs: Venice style_references / Comfy IP-Adapter; ignored for Forge txt2img.
  const rawStyle = normalizeBase64(body.style_image);
  const style_image = useImg2Img
    ? rawStyle || init_image
    : backend === 'comfyui' || backend === 'venice'
      ? rawStyle
      : null;
  const ipadapter_weight = clampFloat(body.ipadapter_weight, COMFY_IPADAPTER_WEIGHT, 0.05, 1.5);
  const mode = useImg2Img
    ? 'img2img'
    : style_image && (backend === 'comfyui' || backend === 'venice')
      ? 'txt2img+style'
      : 'txt2img';
  const requestedCkpt = typeof body.checkpoint === 'string' ? body.checkpoint.trim() : '';
  const checkpoint =
    requestedCkpt && !COMFY_ANIME_CHECKPOINT_RE.test(requestedCkpt)
      ? requestedCkpt
      : FORGE_PREFERRED_CHECKPOINT;

  try {
    if (backend === 'venice') {
      const result = await veniceGenerateImage({
        prompt,
        negative_prompt,
        width,
        height,
        steps,
        cfg_scale,
        model: typeof body.model === 'string' ? body.model : undefined,
        // Map attached source / style into Venice style_references (no local Forge state).
        style_image: style_image || (useImg2Img ? init_image : null),
        style_strength: ipadapter_weight,
        format: 'png',
        safe_mode: false,
      });
      return Response.json(
        {
          image: result.image,
          mimeType: result.mimeType,
          mode,
          backend: 'venice',
          api: result.api,
          prompt,
          style_preset: STYLE_POSITIVE_SUFFIX,
          model: result.model,
          seed: result.seed,
          width,
          height,
        },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          },
        },
      );
    }

    if (backend === 'comfyui') {
      const image = await comfyGenerate({
        baseUrl: trimSlash(body.comfyBaseUrl || COMFY_DEFAULT_BASE_URL),
        prompt,
        negative_prompt,
        steps,
        cfg_scale,
        width,
        height,
        denoise: useImg2Img ? denoise : 1,
        init_image,
        style_image,
        ipadapter_weight,
        checkpoint: requestedCkpt && !COMFY_ANIME_CHECKPOINT_RE.test(requestedCkpt) ? requestedCkpt : '',
      });
      return Response.json({
        image,
        mimeType: 'image/png',
        mode,
        backend: 'comfyui',
        prompt,
        style_preset: STYLE_POSITIVE_SUFFIX,
        denoise: useImg2Img ? denoise : 1,
        seed: -1,
        checkpoint: checkpoint || COMFY_DEFAULT_CHECKPOINT,
        ipadapter: style_image
          ? {
              model: COMFY_IPADAPTER_PLUS_SDXL,
              clip_vision: COMFY_CLIP_VISION_H,
              weight: ipadapter_weight,
              weight_type: COMFY_IPADAPTER_WEIGHT_TYPE,
            }
          : null,
      });
    }

    const image = await forgeGenerate({
      baseUrl: trimSlash(body.a1111BaseUrl || FORGE_DEFAULT_BASE_URL),
      prompt,
      negative_prompt,
      steps,
      cfg_scale,
      width,
      height,
      sampler_name,
      denoise: useImg2Img ? denoise : 1,
      init_image,
      mode: useImg2Img ? 'img2img' : 'txt2img',
      checkpoint,
    });
    return Response.json({
      image,
      mimeType: 'image/png',
      mode: useImg2Img ? 'img2img' : 'txt2img',
      backend: 'a1111',
      api: useImg2Img
        ? `${FORGE_DEFAULT_BASE_URL}${FORGE_IMG2IMG_PATH}`
        : `${FORGE_DEFAULT_BASE_URL}${FORGE_TXT2IMG_PATH}`,
      prompt,
      style_preset: STYLE_POSITIVE_SUFFIX,
      denoise: useImg2Img ? denoise : 1,
      seed: -1,
      checkpoint,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Image generation failed';
    const venice = err instanceof VeniceApiError;
    const forge = err instanceof ForgeBridgeError;
    const status =
      (venice && err.code === 'config') || (venice && err.status === 401)
        ? 401
        : (venice && err.code === 'timeout') || (forge && err.code === 'timeout')
          ? 504
          : (forge && err.code === 'offline') || (venice && err.status === 503)
            ? 503
            : venice && err.status && err.status >= 400 && err.status < 600
              ? err.status
              : 502;
    return Response.json(
      {
        error: message,
        code: venice ? err.code : forge ? err.code : 'unknown',
        retryable: venice ? err.retryable : forge ? err.retryable : false,
        timeoutMs: venice ? VENICE_REQUEST_TIMEOUT_MS : FORGE_REQUEST_TIMEOUT_MS,
        provider: venice ? 'venice' : forge ? 'forge' : 'unknown',
        baseUrl: venice ? VENICE_DEFAULT_BASE_URL : undefined,
      },
      { status },
    );
  }
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function clampFloat(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function normalizeBase64(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const comma = trimmed.indexOf(',');
  if (trimmed.startsWith('data:') && comma >= 0) return trimmed.slice(comma + 1);
  return trimmed;
}

/**
 * Resolve a ControlNet IP-Adapter model name currently loaded in Forge.
 * Prefers Plus SDXL ViT-H; falls back to any IP-Adapter* entry.
 */
async function resolveForgeIpAdapterModel(baseUrl: string): Promise<string> {
  try {
    const res = await forgeFetch(`${baseUrl}/controlnet/control_types`, {
      method: 'GET',
      timeoutMs: 15_000,
      retries: 1,
      ensureReady: true,
    });
    if (!res.ok) return FORGE_IPADAPTER_MODEL;
    const data = await res.json();
    const list: string[] =
      data?.control_types?.['IP-Adapter']?.model_list || data?.control_types?.All?.model_list || [];
    const names = list.filter((n: unknown): n is string => typeof n === 'string' && n !== 'None');
    const preferred =
      names.find((n) => /ip-adapter-faceid_sdxl/i.test(n)) ||
      names.find((n) => /faceid.*sdxl/i.test(n)) ||
      names.find((n) => /ip-adapter-plus_sdxl_vit-h/i.test(n)) ||
      names.find((n) => /ip-adapter.*sdxl/i.test(n));
    return preferred || FORGE_IPADAPTER_MODEL;
  } catch {
    return FORGE_IPADAPTER_MODEL;
  }
}

/**
 * Stable Diffusion Forge / AUTOMATIC1111 API.
 * txt2img and img2img are separate endpoints with isolated payloads:
 * - txt2img → /sdapi/v1/txt2img — no init_images, ControlNet units cleared, seed -1
 * - img2img → /sdapi/v1/img2img — FaceID ControlNet + locked denoise 0.38, seed -1
 */
async function forgeGenerate(args: {
  baseUrl: string;
  prompt: string;
  negative_prompt: string;
  steps: number;
  cfg_scale: number;
  width: number;
  height: number;
  sampler_name: string;
  denoise: number;
  init_image: string | null;
  mode: 'txt2img' | 'img2img';
  checkpoint: string;
}): Promise<string> {
  const isImg2Img = args.mode === 'img2img' && Boolean(args.init_image);
  const steps = FORGE_IMG2IMG_STEPS;
  const cfg_scale = FORGE_IMG2IMG_CFG;
  const sampler_name = FORGE_IMG2IMG_SAMPLER;
  const negative_prompt = STYLE_NEGATIVE_PROMPT;
  const prompt = buildPositiveConditioningText(args.prompt);
  // Always lock to semi-realistic SDXL — never fall back to SD1.5 / anime.
  const checkpoint = FORGE_PREFERRED_CHECKPOINT;

  const basePayload: Record<string, unknown> = {
    prompt,
    negative_prompt,
    steps,
    cfg_scale,
    width: args.width,
    height: args.height,
    sampler_name,
    scheduler: 'Automatic',
    batch_size: 1,
    n_iter: 1,
    ...freshSeedFields(),
    restore_faces: false,
    tiling: false,
    send_images: true,
    save_images: false,
    do_not_save_samples: true,
    do_not_save_grid: true,
    override_settings: {
      sd_model_checkpoint: checkpoint,
    },
    override_settings_restore_afterwards: true,
  };

  if (!isImg2Img) {
    // Fresh text generation — forgeTxt2Img also strips init/mask keys + clears ControlNet.
    const result = await forgeTxt2Img(args.baseUrl, basePayload);
    return result.image;
  }

  const ipAdapterModel = await resolveForgeIpAdapterModel(args.baseUrl);
  const img2imgPayload: Record<string, unknown> = {
    ...basePayload,
    init_images: [args.init_image],
    denoising_strength: FORGE_IMG2IMG_DENOISE,
    resize_mode: 0,
    image_cfg_scale: cfg_scale,
    include_init_images: false,
    // ControlNet IP-Adapter FaceID — only on intentional img2img.
    alwayson_scripts: {
      controlnet: {
        args: [
          {
            enabled: true,
            module: FORGE_IPADAPTER_MODULE,
            model: ipAdapterModel,
            weight: FORGE_IPADAPTER_WEIGHT,
            image: args.init_image,
            resize_mode: 'Crop and Resize',
            lowvram: false,
            processor_res: 512,
            threshold_a: 0.5,
            threshold_b: 0.5,
            guidance_start: 0.0,
            guidance_end: 1.0,
            control_mode: 'Balanced',
            pixel_perfect: true,
          },
        ],
      },
    },
  };

  const result = await forgeImg2Img(args.baseUrl, img2imgPayload);
  return result.image;
}

async function resolveCheckpoint(baseUrl: string, preferred: string): Promise<string> {
  // Explicit non-anime override wins; anime names are rejected upstream.
  if (preferred && !COMFY_ANIME_CHECKPOINT_RE.test(preferred)) return preferred;

  let names: string[] = [];
  try {
    const res = await fetchLocal(`${baseUrl}/models/checkpoints`, {
      method: 'GET',
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const list = (await res.json()) as unknown;
      if (Array.isArray(list)) {
        names = list.filter((n): n is string => typeof n === 'string' && !!n.trim());
      }
    }
  } catch {
    /* fall through */
  }

  for (const want of COMFY_PREFERRED_CHECKPOINTS) {
    const hit = names.find((n) => n === want || n.endsWith(`/${want}`) || n.endsWith(`\\${want}`));
    if (hit) return hit;
  }

  const realistic =
    names.find((n) => /juggernaut|dreamshaper|realvis|realistic|photoreal|raw\s*photo|epicrealism/i.test(n)) ||
    names.find((n) => /xl/i.test(n) && !COMFY_ANIME_CHECKPOINT_RE.test(n));

  if (realistic) return realistic;

  if (names.length && !COMFY_ANIME_CHECKPOINT_RE.test(names[0])) return names[0];

  // Prefer the configured realistic default even if Comfy has not refreshed the list yet.
  return COMFY_DEFAULT_CHECKPOINT;
}

async function uploadComfyImage(baseUrl: string, base64: string): Promise<string> {
  const bytes = Buffer.from(base64, 'base64');
  const filename = `local-assistant-init-${Date.now()}.png`;
  const form = new FormData();
  form.append('image', new Blob([bytes], { type: 'image/png' }), filename);
  form.append('overwrite', 'true');

  const res = await fetchLocal(`${baseUrl}/upload/image`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ComfyUI upload ${res.status}: ${text || res.statusText}`);
  }
  const data = await res.json();
  const name = typeof data?.name === 'string' ? data.name : filename;
  return name;
}

async function comfyGenerate(args: {
  baseUrl: string;
  prompt: string;
  negative_prompt: string;
  steps: number;
  cfg_scale: number;
  width: number;
  height: number;
  denoise: number;
  init_image: string | null;
  style_image: string | null;
  ipadapter_weight: number;
  checkpoint: string;
}): Promise<string> {
  const ckpt = await resolveCheckpoint(args.baseUrl, args.checkpoint);
  const seed = Math.floor(Math.random() * 1_000_000_000);
  // Positive CLIP node always carries the precise 3D render style preset.
  const positiveText = buildPositiveConditioningText(args.prompt);
  const img2imgDenoise = args.init_image ? lockImg2ImgDenoise(args.denoise) : 1;

  let latentSource: [string, number] = ['5', 0];
  let modelSource: [string, number] = ['4', 0];

  const workflow: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: args.steps,
        cfg: args.cfg_scale,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: img2imgDenoise,
        model: modelSource,
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: latentSource,
      },
    },
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: ckpt },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: { width: args.width, height: args.height, batch_size: 1 },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: positiveText, clip: ['4', 1] },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: { text: args.negative_prompt, clip: ['4', 1] },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: { samples: ['3', 0], vae: ['4', 2] },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'local-assistant', images: ['8', 0] },
    },
  };

  let initUploaded: string | null = null;
  if (args.init_image) {
    initUploaded = await uploadComfyImage(args.baseUrl, args.init_image);
    workflow['10'] = {
      class_type: 'LoadImage',
      inputs: { image: initUploaded },
    };
    workflow['11'] = {
      class_type: 'VAEEncode',
      inputs: { pixels: ['10', 0], vae: ['4', 2] },
    };
    latentSource = ['11', 0];
    workflow['3'].inputs.latent_image = latentSource;
  }

  // IP-Adapter Plus (SDXL) style transfer — stylistic guide without overpowering text.
  if (args.style_image) {
    const sameAsInit = Boolean(args.init_image && args.style_image === args.init_image && initUploaded);
    let styleImageNode: [string, number];
    if (sameAsInit) {
      styleImageNode = ['10', 0];
    } else {
      const styleUploaded = await uploadComfyImage(args.baseUrl, args.style_image);
      workflow['12'] = {
        class_type: 'LoadImage',
        inputs: { image: styleUploaded },
      };
      styleImageNode = ['12', 0];
    }

    workflow['20'] = {
      class_type: 'CLIPVisionLoader',
      inputs: { clip_name: COMFY_CLIP_VISION_H },
    };
    workflow['22'] = {
      class_type: 'IPAdapterModelLoader',
      inputs: { ipadapter_file: COMFY_IPADAPTER_PLUS_SDXL },
    };
    // IPAdapterAdvanced with SDXL style-transfer weight type (Plus V2 / ViT-H).
    // Installed ComfyUI_IPAdapter_plus exposes this as "style transfer"
    // (equivalent to "style transfer (sdxl)" in newer UI labels).
    workflow['23'] = {
      class_type: 'IPAdapterAdvanced',
      inputs: {
        model: ['4', 0],
        ipadapter: ['22', 0],
        image: styleImageNode,
        weight: args.ipadapter_weight,
        weight_type: COMFY_IPADAPTER_WEIGHT_TYPE,
        combine_embeds: 'concat',
        start_at: 0,
        end_at: 1,
        embeds_scaling: 'V only',
        clip_vision: ['20', 0],
      },
    };
    modelSource = ['23', 0];
    workflow['3'].inputs.model = modelSource;
  }

  const queue = await fetchLocal(`${args.baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!queue.ok) {
    const text = await queue.text().catch(() => '');
    throw new Error(`ComfyUI queue ${queue.status}: ${text || queue.statusText}`);
  }
  const queued = await queue.json();
  const promptId = queued?.prompt_id;
  if (!promptId) throw new Error('ComfyUI did not return a prompt_id');
  if (queued?.node_errors && Object.keys(queued.node_errors).length) {
    throw new Error(`ComfyUI workflow error: ${JSON.stringify(queued.node_errors)}`);
  }

  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    await sleep(1200);
    const hist = await fetchLocal(`${args.baseUrl}/history/${promptId}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!hist.ok) continue;
    const data = await hist.json();
    const entry = data?.[promptId];
    if (!entry) continue;
    if (entry.status?.status_str === 'error') {
      throw new Error(`ComfyUI execution failed: ${JSON.stringify(entry.status)}`);
    }
    const images = entry?.outputs?.['9']?.images;
    if (!Array.isArray(images) || !images[0]?.filename) continue;
    const file = images[0];
    const view = await fetchLocal(
      `${args.baseUrl}/view?filename=${encodeURIComponent(file.filename)}&subfolder=${encodeURIComponent(file.subfolder || '')}&type=${encodeURIComponent(file.type || 'output')}`,
      { signal: AbortSignal.timeout(60_000) },
    );
    if (!view.ok) throw new Error(`ComfyUI view failed (${view.status})`);
    const buf = Buffer.from(await view.arrayBuffer());
    return buf.toString('base64');
  }
  throw new Error('ComfyUI timed out waiting for the image');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
