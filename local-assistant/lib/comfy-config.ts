/** Local ComfyUI Desktop (Nexus AI) install — API defaults to port 8188. */
export const COMFY_INSTALL_PATH =
  'C:\\Users\\faith\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Installs\\Nexus AI\\ComfyUI';

export const COMFY_SHARED_MODELS_PATH =
  'C:\\Users\\faith\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\models';

export const COMFY_DEFAULT_BASE_URL = 'http://127.0.0.1:8188';

/**
 * 3D / semi-realistic SDXL checkpoint (not anime).
 * Install into ComfyUI-Shared/models/checkpoints/
 */
export const COMFY_DEFAULT_CHECKPOINT = 'Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors';

/** Alternate realistic XL names the resolver will prefer over anime weights. */
export const COMFY_PREFERRED_CHECKPOINTS = [
  'Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors',
  'juggernautXL_v9Rundiffusion.safetensors',
  'juggernautXL_v8Rundiffusion.safetensors',
  'dreamshaperXL_v21TurboDPMSDE.safetensors',
  'DreamShaperXL_Turbo_DPMSDE.safetensors',
  'dreamshaperXL_lightningDPMSDE.safetensors',
] as const;

export const COMFY_ANIME_CHECKPOINT_RE = /pony|noobai|anime|illustrious|hassaku|counterfeit|anything|aom\d|nai/i;

/** Locked img2img denoise (aligned with Forge FaceID bridge). */
export const COMFY_DEFAULT_DENOISE = 0.38;
export const COMFY_DENOISE_MIN = 0.38;
export const COMFY_DENOISE_MAX = 0.38;

/**
 * IP-Adapter Plus (SDXL / ViT-H) — style transfer guide.
 * Installed names on this machine (Comfy lists safetensors, not the older .bin).
 * CLIP-ViT-H-14-laion2B is provided as clip_vision_h.safetensors.
 */
export const COMFY_IPADAPTER_PLUS_SDXL = 'ip-adapter-plus_sdxl_vit-h.safetensors';
export const COMFY_CLIP_VISION_H = 'clip_vision_h.safetensors';

/** ComfyUI_IPAdapter_plus weight type for SDXL style transfer. */
export const COMFY_IPADAPTER_WEIGHT_TYPE = 'style transfer';
export const COMFY_IPADAPTER_WEIGHT = 0.65;
