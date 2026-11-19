/**
 * Back-compat exports for NSFW cues.
 * Canonical SFW/NSFW rules live in `@/lib/content-rating`.
 */
export {
  characterImpliesNsfw,
  characterBrowseImpliesNsfw,
  textImpliesNsfw,
  rateCharacterContent,
  rateContentText,
  isPlayStoreSafe,
  SFW_VIOLATION_MESSAGE,
  type ContentRating,
} from '@/lib/content-rating';
