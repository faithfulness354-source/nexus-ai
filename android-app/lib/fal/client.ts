import 'server-only';
import { fal } from '@fal-ai/client';

export const FAL_TEXT_MODEL = 'fal-ai/flux-2';
export const FAL_EDIT_MODEL = 'fal-ai/flux-2/edit';

export const FAL_DEFAULTS = {
  guidance_scale: 3.5,
  num_inference_steps: 28,
  image_size: { width: 1024, height: 1024 } as const,
  landscape_size: { width: 1024, height: 768 } as const,
  output_format: 'png' as const,
  num_images: 1,
};

export function falConfigured(): boolean {
  return !!process.env.FAL_KEY?.trim();
}

function configureFal(): void {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw new Error('FAL_KEY is not configured.');
  fal.config({ credentials: key });
}

export interface FalSceneResult {
  url: string;
  model: string;
  seed?: number;
}

type FalImagePayload = {
  images?: Array<{ url?: string }>;
  seed?: number;
};

/**
 * Generate a scene with fal-ai/flux-2.
 * When a public avatar URL is available, uses fal-ai/flux-2/edit with image_urls
 * (referenced in the prompt as @image1) for character consistency.
 */
export async function generateFalScene(opts: {
  prompt: string;
  referenceImageUrl?: string | null;
  landscape?: boolean;
  /** Disable safety checker for authenticated Premium+/Ultimate NSFW sessions only. */
  disableSafetyChecker?: boolean;
}): Promise<FalSceneResult> {
  configureFal();
  const image_size = opts.landscape ? FAL_DEFAULTS.landscape_size : FAL_DEFAULTS.image_size;
  const enable_safety_checker = !opts.disableSafetyChecker;
  const reference = (opts.referenceImageUrl ?? '').trim();
  const useEdit = /^https?:\/\//i.test(reference);

  if (useEdit) {
    const result = await fal.subscribe(FAL_EDIT_MODEL, {
      input: {
        prompt: opts.prompt,
        image_urls: [reference],
        guidance_scale: FAL_DEFAULTS.guidance_scale,
        num_inference_steps: FAL_DEFAULTS.num_inference_steps,
        image_size,
        num_images: FAL_DEFAULTS.num_images,
        enable_safety_checker,
        output_format: FAL_DEFAULTS.output_format,
      },
      logs: false,
    });
    const data = result.data as FalImagePayload;
    const url = data?.images?.[0]?.url;
    if (!url) throw new Error('fal.ai edit returned no image.');
    return { url, model: FAL_EDIT_MODEL, seed: data.seed };
  }

  const result = await fal.subscribe(FAL_TEXT_MODEL, {
    input: {
      prompt: opts.prompt,
      guidance_scale: FAL_DEFAULTS.guidance_scale,
      num_inference_steps: FAL_DEFAULTS.num_inference_steps,
      image_size,
      num_images: FAL_DEFAULTS.num_images,
      enable_safety_checker,
      output_format: FAL_DEFAULTS.output_format,
    },
    logs: false,
  });
  const data = result.data as FalImagePayload;
  const url = data?.images?.[0]?.url;
  if (!url) throw new Error('fal.ai generation returned no image.');
  return { url, model: FAL_TEXT_MODEL, seed: data.seed };
}
