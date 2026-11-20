/**
 * Target look for localhost:3010 → Forge :7860.
 * Short subject prompts are expanded with the high-end 2.5D / cinematic style preset.
 */
export const STYLE_POSITIVE_SUFFIX = [
  'Masterpiece',
  'high-end 2.5D digital character illustration',
  'intricate latex and lace outfit',
  'soft cinematic studio lighting',
  'volumetric shadows',
  'rich depth of field',
  'detailed facial features',
  'photorealistic material textures',
  '3d digital character art',
  'unreal engine 5 render',
  'glossy latex textures',
  'dramatic neon rim lighting',
  'cinematic composition',
  'smooth volumetric shading',
].join(', ');

/** Locked Forge img2img denoising strength (FaceID bridge). */
export const STYLE_IMG2IMG_DENOISE = 0.38;
export const STYLE_IMG2IMG_DENOISE_MIN = 0.38;
export const STYLE_IMG2IMG_DENOISE_MAX = 0.38;

/** Treat prompts at or under this length as "short" and always expand them. */
export const SHORT_PROMPT_MAX_CHARS = 160;

/** Negative prompt from the FaceID bridge script (+ prior identity guards). */
export const STYLE_NEGATIVE_PROMPT =
  'ugly, deformed, crosshatch, grid artifacts, flat lighting, 2d anime, lowres, jpeg artifacts, bald, distorted geometry, distorted halo, deformed anatomy';

/** Expand a subject prompt with the cinematic style preset when short / missing style tags. */
export function expandWithStylePreset(rawPrompt: string): string {
  const prompt = rawPrompt.trim();
  if (!prompt) return prompt;

  const alreadyStyled =
    /high-end 2\.5D digital character illustration/i.test(prompt) ||
    (/unreal engine 5 render/i.test(prompt) && /glossy latex/i.test(prompt));

  if (alreadyStyled) return prompt;

  const isShort = prompt.length <= SHORT_PROMPT_MAX_CHARS;
  if (isShort || !/photorealistic material textures|unreal engine 5/i.test(prompt)) {
    return `${prompt}, ${STYLE_POSITIVE_SUFFIX}`;
  }

  return prompt;
}

/** Positive conditioning text: subject + cinematic style preset. */
export function buildPositiveConditioningText(subjectOrExpanded: string): string {
  return expandWithStylePreset(subjectOrExpanded);
}

/** Force img2img denoise to the locked Forge FaceID value (0.38). */
export function lockImg2ImgDenoise(_value?: unknown): number {
  return STYLE_IMG2IMG_DENOISE;
}
