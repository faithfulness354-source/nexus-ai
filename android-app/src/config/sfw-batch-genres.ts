/**
 * Genre lanes for the 50-card SFW batch (web + playStoreSafe).
 * Distinct from the older 100-card cozy/high-fantasy pipeline.
 */

export const SFW_BATCH_GENRES = [
  'slice_of_life',
  'academy_life',
  'fantasy_academy_life',
  'swords_and_sorcery',
  'isekai',
  'cyberpunk',
] as const;

export type SfwBatchGenre = (typeof SFW_BATCH_GENRES)[number];

export const SFW_BATCH_GENRE_LABEL: Record<SfwBatchGenre, string> = {
  slice_of_life: 'slice-of-life, modern, everyday',
  academy_life: 'academy-life, campus, modern',
  fantasy_academy_life: 'fantasy-academy, magic-school',
  swords_and_sorcery: 'swords-and-sorcery, high-fantasy, adventure',
  isekai: 'isekai, otherworld, adventure',
  cyberpunk: 'cyberpunk, neon-city, sci-fi',
};

export const SFW_BATCH_STAKE: Record<SfwBatchGenre, string> = {
  slice_of_life:
    'Tone is grounded everyday life: cafes, diners, workshops, night shifts, studios, apartments, and street-level choices. Comfort and honesty matter more than spectacle.',
  academy_life:
    'Tone is modern campus life: lectures, clubs, libraries, dorm corridors, and the pressure of being seen as competent while still figuring yourself out.',
  fantasy_academy_life:
    'Tone is a magic academy: classes, dorm towers, practice yards, and rivalries where talent has a cost and curiosity can rewrite the rules.',
  swords_and_sorcery:
    'Tone is swords-and-sorcery adventure: roads, ruins, bargains, steel, and old magic. Watching from the sidelines is not the same as joining the next mile.',
  isekai:
    'Tone is isekai: at least one person is new to this world’s rules, and guessing wrong has a consequence even when the hospitality feels kind.',
  cyberpunk:
    'Tone is cyberpunk: neon weather, corporate pressure, street loyalty, and tech that always sends a bill later.',
};

/** 2.5D→3D card-sheet visual anchors (stylized semi-realistic, not photo). */
export const SFW_CARD_SHEET_STYLE =
  'stylized-to-semi-realistic 2.5D/3D character card sheet, dimensional rim and key light, rich material response, layered environment depth, polished digital illustration, character-card layout framing, soft subsurface skin, intricate costume detail, masterpiece, best quality';

export const SFW_CARD_NEGATIVE =
  'photorealistic, photograph, DSLR, stock photo, real person, nude, nudity, nipples, genitalia, bare buttocks, lingerie, sheer see-through that exposes anatomy, child, underage, loli, shota, flat 2D, chibi, low-poly, cropped head, passport photo';
