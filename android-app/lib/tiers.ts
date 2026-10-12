// Client-safe tier catalogue. Server-side enforcement lives in lib/access.ts.
export type TierId = 'FREE' | 'PLUS' | 'PREMIUM' | 'ULTIMATE';
export type PaidTierId = Exclude<TierId, 'FREE'>;

export interface TierDef {
  id: TierId;
  name: string;
  price: number; // USD per month
  /** Daily message credits; null = unlimited. 1 credit = 1 text message. */
  dailyCredits: number | null;
  /** Daily image/scene generation credits (0 = none). */
  dailyImageCredits: number;
  /** Max context tokens sent to the model (memory allocation). */
  contextTokens: number;
  speed: 'standard' | 'fast' | 'priority' | 'priority-queue';
  customPrompts: boolean; // custom system prompts + lorebooks
  advancedGeneration: boolean; // temperature / top-p sampling sliders
  proModels: boolean; // "pro" Gemini models
  nsfw: boolean; // 18+ content (still requires age verification)
  sceneImages: boolean; // dynamic inline scene rendering ([GENERATE_IMAGE])
  vipThemes: boolean; // VIP profile themes & badge
  features: string[];
}

export const TIERS: Record<TierId, TierDef> = {
  FREE: {
    id: 'FREE', name: 'Free', price: 0, dailyCredits: 50, dailyImageCredits: 0, contextTokens: 4_000, speed: 'standard',
    customPrompts: false, advancedGeneration: false, proModels: false, nsfw: false, sceneImages: false, vipThemes: false,
    features: ['50 daily credits (1 credit = 1 message)', 'Standard response speed', '4k context window'],
  },
  PLUS: {
    id: 'PLUS', name: 'Plus', price: 9.99, dailyCredits: 500, dailyImageCredits: 0, contextTokens: 16_000, speed: 'fast',
    customPrompts: true, advancedGeneration: false, proModels: false, nsfw: false, sceneImages: false, vipThemes: false,
    features: ['500 daily credits', 'Fast response speed', 'Lorebooks & custom system prompts', '16k context window'],
  },
  PREMIUM: {
    id: 'PREMIUM', name: 'Premium', price: 19.99, dailyCredits: 2_000, dailyImageCredits: 0, contextTokens: 32_000, speed: 'priority',
    customPrompts: true, advancedGeneration: true, proModels: true, nsfw: true, sceneImages: false, vipThemes: false,
    features: ['2,000 daily credits', 'High-speed priority routing', 'Advanced sampling sliders (Temperature / Top-P)', '32k context window', '18+ NSFW content access'],
  },
  ULTIMATE: {
    id: 'ULTIMATE', name: 'Ultimate', price: 49.99, dailyCredits: null, dailyImageCredits: 100, contextTokens: 64_000, speed: 'priority-queue',
    customPrompts: true, advancedGeneration: true, proModels: true, nsfw: true, sceneImages: true, vipThemes: true,
    features: ['Unlimited text generations', '100 daily image / scene credits', 'Maximum 64k context window', 'Priority queue routing', 'Dynamic inline scene rendering', 'VIP profile themes & badge', 'Everything in Premium, incl. 18+ access'],
  },
};

/** Advanced sampling slider ranges (Premium/Ultimate). Values outside are clamped server-side. */
export const SAMPLING_LIMITS = {
  temperature: { min: 0.1, max: 1.5, default: 0.8 },
  topP: { min: 0.1, max: 1.0, default: 0.95 },
} as const;

export function clampSampling(key: keyof typeof SAMPLING_LIMITS, value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const { min, max } = SAMPLING_LIMITS[key];
  return Math.min(max, Math.max(min, value));
}

export type TierFeature = 'customPrompts' | 'advancedGeneration' | 'proModels' | 'nsfw' | 'sceneImages' | 'vipThemes';

export const TIER_ORDER: TierId[] = ['FREE', 'PLUS', 'PREMIUM', 'ULTIMATE'];
export const PAID_TIERS: PaidTierId[] = ['PLUS', 'PREMIUM', 'ULTIMATE'];

export function isTierId(v: unknown): v is TierId {
  return typeof v === 'string' && (TIER_ORDER as string[]).includes(v);
}

export function isProModel(model?: string | null): boolean {
  return !!model && /-pro(-|$)/i.test(model);
}

/** Shape returned by GET /api/billing/status and used across the client. */
export interface AccessStatus {
  authenticated: boolean;
  userId: string | null;
  username: string | null;
  isAdmin: boolean;
  isCreatorAdmin: boolean; // whitelisted CREATOR_ADMIN only; gates API settings
  avatarUrl: string | null; // User.image (profile avatar), shown in the header
  tier: TierId;
  dailyCredits: number | null; // null = unlimited
  creditsUsed: number;
  creditsRemaining: number | null; // null = unlimited
  dailyImageCredits: number | null; // null = unlimited (admins)
  imageCreditsUsed: number;
  imageCreditsRemaining: number | null;
  contextTokens: number | null; // null = full model window (admins)
  resetsAt: string; // ISO time of next UTC midnight
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  hasSubscription: boolean;
  paymentsConfigured: boolean;
  can: Record<TierFeature, boolean>;
}
