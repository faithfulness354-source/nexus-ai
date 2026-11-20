/** Stable Diffusion WebUI Forge (AUTOMATIC1111-compatible) API. */
export const FORGE_DEFAULT_BASE_URL = 'http://127.0.0.1:7860';
export const FORGE_DEFAULT_PORT = 7860;

export const FORGE_IMG2IMG_PATH = '/sdapi/v1/img2img';
export const FORGE_TXT2IMG_PATH = '/sdapi/v1/txt2img';
/** Lightweight readiness probe used before long img2img jobs. */
export const FORGE_PROGRESS_PATH = '/sdapi/v1/progress';

/** Locked semi-realistic SDXL checkpoint for 3D character work. */
export const FORGE_PREFERRED_CHECKPOINT = 'Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors';

/**
 * Locked Forge img2img sampling — matches the FaceID bridge script:
 * DPM++ 2M Karras · 28 steps · CFG 6.5 · denoise 0.38
 */
export const FORGE_IMG2IMG_SAMPLER = 'DPM++ 2M Karras';
export const FORGE_IMG2IMG_STEPS = 28;
export const FORGE_IMG2IMG_CFG = 6.5;
export const FORGE_IMG2IMG_DENOISE = 0.38;

/**
 * ControlNet IP-Adapter FaceID (SDXL).
 * Forge UI module name for A1111's `ip-adapter_faceid`.
 */
export const FORGE_IPADAPTER_MODULE = 'InsightFace+CLIP-H (IPAdapter)';
export const FORGE_IPADAPTER_MODEL = 'ip-adapter-faceid_sdxl';
export const FORGE_IPADAPTER_WEIGHT = 0.8;

/**
 * Local RTX 4050 img2img can take well over a minute with FaceID + SDXL.
 * Hard request timeout for Forge API calls (and the Next → Forge bridge).
 */
export const FORGE_REQUEST_TIMEOUT_MS = 180_000;
/** How long to wait for Forge to become reachable before failing a job. */
export const FORGE_READY_WAIT_MS = 90_000;
export const FORGE_READY_POLL_MS = 2_000;
/** Retries for transient offline / 5xx / aborted connections (not model errors). */
export const FORGE_MAX_RETRIES = 3;
export const FORGE_RETRY_BASE_DELAY_MS = 2_500;
