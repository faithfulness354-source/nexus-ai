/** Scene image: initial + escalating rerolls (max 5 rerolls after the first render). */
export const MAX_SCENE_REROLLS = 5;
/** Total allowed scene generations per message = 1 initial + MAX_SCENE_REROLLS. */
export const MAX_SCENE_GENERATIONS = 1 + MAX_SCENE_REROLLS;

/** Text: max regenerations (swipes) of the same assistant turn. */
export const MAX_TEXT_SWIPES = 10;
/** After this many completed text rerolls, each further swipe costs 2 credits. */
export const TEXT_REROLL_ESCALATE_AFTER = 3;

export const IMAGE_COOLDOWN_MS = 10_000;
export const TEXT_COOLDOWN_MS = 2_000;

/**
 * Image credit cost for the next scene generation.
 * `generationCount` = how many successful generations already exist for this message.
 * 0 → initial (1), 1 → 1st reroll (2), 2 → 2nd (3), 3+ → 5.
 */
export function sceneCreditCost(generationCount: number): number {
  const n = Math.max(0, Math.floor(generationCount));
  if (n <= 0) return 1;
  if (n === 1) return 2;
  if (n === 2) return 3;
  return 5;
}

export function sceneRerollCount(generationCount: number): number {
  return Math.max(0, Math.floor(generationCount) - 1);
}

export function canSceneGenerate(generationCount: number): boolean {
  return Math.max(0, Math.floor(generationCount)) < MAX_SCENE_GENERATIONS;
}

/**
 * Text credit cost for a regeneration swipe.
 * `swipeCount` = how many successful regenerations already completed on this turn.
 * Swipes 1–3 cost 1; swipes 4+ cost 2. Fresh sends always use cost 1 separately.
 */
export function textSwipeCreditCost(swipeCount: number): number {
  const n = Math.max(0, Math.floor(swipeCount));
  return n >= TEXT_REROLL_ESCALATE_AFTER ? 2 : 1;
}

export function canTextSwipe(swipeCount: number): boolean {
  return Math.max(0, Math.floor(swipeCount)) < MAX_TEXT_SWIPES;
}

export function sceneRegenButtonLabel(generationCount: number): string {
  if (!canSceneGenerate(generationCount)) return 'Reroll limit reached';
  const cost = sceneCreditCost(generationCount);
  const rerolls = sceneRerollCount(generationCount);
  if (rerolls < 0 || generationCount <= 0) return `Generate (${cost} Credit${cost === 1 ? '' : 's'})`;
  return `Regenerate (${cost} Credit${cost === 1 ? '' : 's'})`;
}
