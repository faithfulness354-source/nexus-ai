import { NextRequest } from 'next/server';
import { fetchLocal, trimSlash } from '@/lib/local-fetch';

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
  backend?: 'a1111' | 'comfyui';
  a1111BaseUrl?: string;
  comfyBaseUrl?: string;
};

/**
 * Proxies txt2img to Automatic1111 / Forge or a minimal ComfyUI workflow.
 * Returns the first base64 image unchanged.
 */
export async function POST(request: NextRequest) {
  let body: ImageBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return Response.json({ error: 'prompt is required' }, { status: 400 });

  const negative_prompt = typeof body.negative_prompt === 'string' ? body.negative_prompt : '';
  const steps = clampInt(body.steps, 30, 1, 150);
  const cfg_scale = clampFloat(body.cfg_scale, 7, 1, 30);
  const width = clampInt(body.width, 512, 64, 2048);
  const height = clampInt(body.height, 768, 64, 2048);
  const sampler_name = (body.sampler_name || 'Euler a').trim() || 'Euler a';
  const backend = body.backend === 'comfyui' ? 'comfyui' : 'a1111';

  try {
    if (backend === 'comfyui') {
      const image = await comfyTxt2Img({
        baseUrl: trimSlash(body.comfyBaseUrl || 'http://127.0.0.1:8188'),
        prompt,
        negative_prompt,
        steps,
        cfg_scale,
        width,
        height,
      });
      return Response.json({ image, mimeType: 'image/png' });
    }

    const image = await a1111Txt2Img({
      baseUrl: trimSlash(body.a1111BaseUrl || 'http://127.0.0.1:7860'),
      prompt,
      negative_prompt,
      steps,
      cfg_scale,
      width,
      height,
      sampler_name,
    });
    return Response.json({ image, mimeType: 'image/png' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Image generation failed';
    return Response.json({ error: message }, { status: 502 });
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

async function a1111Txt2Img(args: {
  baseUrl: string;
  prompt: string;
  negative_prompt: string;
  steps: number;
  cfg_scale: number;
  width: number;
  height: number;
  sampler_name: string;
}): Promise<string> {
  const res = await fetchLocal(`${args.baseUrl}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: args.prompt,
      negative_prompt: args.negative_prompt,
      steps: args.steps,
      cfg_scale: args.cfg_scale,
      width: args.width,
      height: args.height,
      sampler_name: args.sampler_name,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`A1111/Forge ${res.status}: ${text || res.statusText}`);
  }
  const data = await res.json();
  const image = Array.isArray(data?.images) ? data.images[0] : null;
  if (typeof image !== 'string' || !image) throw new Error('A1111/Forge returned no image data');
  return image.includes(',') ? image.split(',').pop()! : image;
}

async function comfyTxt2Img(args: {
  baseUrl: string;
  prompt: string;
  negative_prompt: string;
  steps: number;
  cfg_scale: number;
  width: number;
  height: number;
}): Promise<string> {
  // Minimal default checkpoint workflow. Change ckpt_name in ComfyUI if your file differs.
  const workflow = {
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed: Math.floor(Math.random() * 1_000_000_000),
        steps: args.steps,
        cfg: args.cfg_scale,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: 1,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
    },
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: 'model.safetensors' },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: { width: args.width, height: args.height, batch_size: 1 },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: args.prompt, clip: ['4', 1] },
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

  const queue = await fetchLocal(`${args.baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!queue.ok) {
    const text = await queue.text().catch(() => '');
    throw new Error(`ComfyUI queue ${queue.status}: ${text || queue.statusText}`);
  }
  const queued = await queue.json();
  const promptId = queued?.prompt_id;
  if (!promptId) throw new Error('ComfyUI did not return a prompt_id');

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await sleep(1200);
    const hist = await fetchLocal(`${args.baseUrl}/history/${promptId}`);
    if (!hist.ok) continue;
    const data = await hist.json();
    const entry = data?.[promptId];
    if (!entry) continue;
    const images = entry?.outputs?.['9']?.images;
    if (!Array.isArray(images) || !images[0]?.filename) continue;
    const file = images[0];
    const view = await fetchLocal(
      `${args.baseUrl}/view?filename=${encodeURIComponent(file.filename)}&subfolder=${encodeURIComponent(file.subfolder || '')}&type=${encodeURIComponent(file.type || 'output')}`,
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
