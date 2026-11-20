/** Venice.ai image API — replaces local Forge for cloud generations. */
export const VENICE_DEFAULT_BASE_URL = 'https://api.venice.ai/api/v1';
export const VENICE_IMAGE_GENERATE_PATH = '/image/generate';
/** OpenAI-compatible fallback path (fewer features). */
export const VENICE_IMAGES_GENERATIONS_PATH = '/images/generations';

/** Pixel-size SD model that accepts width/height + negative_prompt. */
export const VENICE_DEFAULT_IMAGE_MODEL = 'venice-sd35';

export const VENICE_REQUEST_TIMEOUT_MS = 120_000;
export const VENICE_MAX_RETRIES = 2;
export const VENICE_RETRY_BASE_DELAY_MS = 1_500;

/** Venice pixel models cap at 1280 on each side. */
export const VENICE_MAX_DIMENSION = 1280;
