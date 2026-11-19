/**
 * Nexus AI SFW / NSFW classification (web platform).
 *
 * NSFW is ONLY:
 *  1) Visual nudity — exposed bare breasts/nipples, genitalia, or bare buttocks
 *     (including when shown in mirrors/reflections)
 *  2) Explicit sexual text — sexually explicit dialogue, bios, greetings, scenarios
 *
 * SFW explicitly ALLOWS clothed suggestive fashion: high-slit dresses/nightgowns,
 * bare hips, bikini-style armor, sheer/semi-translucent fabrics — as long as
 * nipples, genitalia, bare buttocks, or explicit pelvic outlines are not visible
 * and the card text is non-sexual.
 *
 * `playStoreSafe` is a stricter companion flag for app-store builds (rejects
 * sheer / high-slit / bikini-armor fashion even when web-SFW).
 */

export type NsfwCategory = 'visual_nudity' | 'explicit_sexual_text';

export interface ContentRating {
  /** True under Nexus web NSFW rules. */
  isNsfw: boolean;
  /** Stricter companion for store builds; false when fashion would fail store review. */
  playStoreSafe: boolean;
  categories: NsfwCategory[];
  reasons: string[];
  matched: string[];
}

export const SFW_VIOLATION_MESSAGE =
  'This falls under NSFW content and cannot be applied to SFW fields.';

function asText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

/** Strip HTML so markup cannot hide policy words. */
export function plainPolicyText(...parts: unknown[]): string {
  return parts
    .map(asText)
    .join('\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fashion / attire that is allowed on SFW cards (must not, by itself, force NSFW).
 * Kept for documentation and optional UI hints; matching these is not a violation.
 */
export const SFW_ALLOWED_FASHION_RE =
  /\b(high[-\s]?slit|side[-\s]?slit|thigh[-\s]?slit|slit\s+dress|nightgown|nightie|bare\s+hips?|bare\s+midriff|midriff|crop\s*top|bikini[-\s]?armou?r|micro[-\s]?bikini|swimsuit|sheer|semi[-\s]?translucent|translucent|see[-\s]?through|lace|lingerie|underwear|panties|stockings?|garter|cleavage|plunging\s+neckline|open[-\s]?back)\b/i;

/** Visual nudity / explicit anatomy that makes a card NSFW. */
const VISUAL_NUDITY_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(nipples?|areolas?|areolae)\b/i, label: 'exposed nipples' },
  { re: /\b(bare\s+breasts?|exposed\s+breasts?|breasts?\s+out|breasts?\s+exposed|shirtless\s+breasts?)\b/i, label: 'exposed breasts' },
  { re: /\b(topless|bottomless|fully\s+nude|completely\s+nude|stark\s+naked)\b/i, label: 'nudity' },
  { re: /\b(nude|naked)\b(?!\s+(eye|chamaeleon|ambition))/i, label: 'nudity' },
  { re: /\b(genitalia|genitals?|penis|vagina|pussy|cock|dick|balls?|scrotum|labia|clitoris|anus)\b/i, label: 'genitalia' },
  { re: /\b(bare\s+buttocks?|bare\s+ass(?:es)?|exposed\s+buttocks?|ass\s+out|butt\s+crack)\b/i, label: 'bare buttocks' },
  { re: /\b(explicit\s+pelvic\s+outline|pelvic\s+outline|camel\s*toe|bulge\s+outline)\b/i, label: 'explicit pelvic outline' },
  { re: /\b(no\s+panties|without\s+underwear|crotchless|nipple\s+pasties?\s+only)\b/i, label: 'exposed intimate areas' },
  { re: /\b(?:reflection|mirror)\b[^.]{0,80}\b(nipples?|genitalia|genitals?|bare\s+breasts?|bare\s+buttocks?|nude|naked)\b/i, label: 'nudity in reflection' },
];

/** Sexually explicit prose (dialogue, bios, greetings, scenarios). */
const EXPLICIT_SEXUAL_TEXT_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(fuck(?:ing|s|ed)?|cock[-\s]?suck|blowjob|handjob|deepthroat|cum(?:ming|shot)?|orgasm(?:s|ing)?|ejaculat(?:e|ion|ing)|penetrat(?:e|ion|ing)|thrust(?:ing|s)?\s+(?:into|inside)|riding\s+(?:his|her|their)\s+cock)\b/i, label: 'sexually explicit language' },
  { re: /\b(have\s+sex|having\s+sex|sexual\s+intercourse|make\s+love\s+to|erotic\s+roleplay\s+sex)\b/i, label: 'explicit sexual scenario' },
  { re: /\b(moaning\s+in\s+(?:ecstasy|pleasure)|wet\s+(?:pussy|cunt)|hard\s+cock|stroke(?:s|d|ing)?\s+(?:his|her|their)\s+(?:cock|clit))\b/i, label: 'explicit sexual description' },
  { re: /\b(nsfw\s*:\s*sex|explicit\s+sex\s+scene|pornographic)\b/i, label: 'explicit sexual content tag' },
];

/** Stricter fashion cues that fail play-store-safe even when web-SFW. */
const PLAY_STORE_STRICT_FASHION_RE =
  /\b(high[-\s]?slit|side[-\s]?slit|sheer|semi[-\s]?translucent|translucent|see[-\s]?through|bikini[-\s]?armou?r|micro[-\s]?bikini|lingerie|panties|bare\s+hips?|cleavage|nightgown|nightie)\b/i;

function collectMatches(
  text: string,
  patterns: Array<{ re: RegExp; label: string }>,
): { labels: string[]; matched: string[] } {
  const labels: string[] = [];
  const matched: string[] = [];
  for (const { re, label } of patterns) {
    const m = text.match(re);
    if (m) {
      labels.push(label);
      matched.push(m[0].slice(0, 40));
    }
  }
  return { labels, matched };
}

/** Rate free-form text (and optional image/attire captions) under Nexus web policy. */
export function rateContentText(...parts: unknown[]): ContentRating {
  const text = plainPolicyText(...parts);
  if (!text) {
    return { isNsfw: false, playStoreSafe: true, categories: [], reasons: [], matched: [] };
  }

  const visual = collectMatches(text, VISUAL_NUDITY_PATTERNS);
  const sexual = collectMatches(text, EXPLICIT_SEXUAL_TEXT_PATTERNS);

  const categories: NsfwCategory[] = [];
  const reasons: string[] = [];
  const matched = [...visual.matched, ...sexual.matched];

  if (visual.labels.length) {
    categories.push('visual_nudity');
    reasons.push(
      `Visual nudity indicators (${[...new Set(visual.labels)].join(', ')}). NSFW requires exposed bare breasts/nipples, genitalia, or bare buttocks.`,
    );
  }
  if (sexual.labels.length) {
    categories.push('explicit_sexual_text');
    reasons.push(
      `Sexually explicit text (${[...new Set(sexual.labels)].join(', ')}). Explicit sexual dialogue, bios, greetings, or scenarios are NSFW even if the image is clothed.`,
    );
  }

  const isNsfw = categories.length > 0;
  const fashionStrict = PLAY_STORE_STRICT_FASHION_RE.test(text);
  const playStoreSafe = !isNsfw && !fashionStrict;

  return { isNsfw, playStoreSafe, categories, reasons, matched: [...new Set(matched)] };
}

export type RateableCard = {
  name?: unknown;
  title?: unknown;
  summary?: unknown;
  personality?: unknown;
  scenario?: unknown;
  initialMessage?: unknown;
  firstMessage?: unknown;
  exampleDialogue?: unknown;
  creatorNotes?: unknown;
  systemPrompt?: unknown;
  tags?: unknown;
  gallery?: unknown;
  visualDescription?: unknown;
  visualAnchor?: unknown;
  avatarLabel?: unknown;
  attire?: unknown;
} | null | undefined;

/** Rate a character card’s text fields (HTML stripped). */
export function rateCharacterContent(card: RateableCard): ContentRating {
  if (!card) return { isNsfw: false, playStoreSafe: true, categories: [], reasons: [], matched: [] };
  return rateContentText(
    card.name,
    card.title,
    card.summary,
    card.personality,
    card.scenario,
    card.initialMessage,
    card.firstMessage,
    card.exampleDialogue,
    card.creatorNotes,
    card.systemPrompt,
    card.tags,
    card.gallery,
    card.visualDescription,
    card.visualAnchor,
    card.avatarLabel,
    card.attire,
  );
}

/** True when card text/gallery captions imply NSFW under web rules. */
export function characterImpliesNsfw(card: RateableCard): boolean {
  return rateCharacterContent(card).isNsfw;
}

export function textImpliesNsfw(...parts: unknown[]): boolean {
  return rateContentText(...parts).isNsfw;
}

/** Stricter store companion — available for Android/Play builds without changing web SFW. */
export function isPlayStoreSafe(...parts: unknown[]): boolean {
  return rateContentText(...parts).playStoreSafe;
}

/** HTTP 400 body when a creator tries to save NSFW material into SFW fields. */
export function sfwViolationPayload(rating: ContentRating) {
  const detail = rating.reasons[0] ? ` ${rating.reasons[0]}` : '';
  return {
    error: `${SFW_VIOLATION_MESSAGE}${detail}`,
    message: SFW_VIOLATION_MESSAGE,
    code: 'SFW_VIOLATION' as const,
    reasons: rating.reasons,
    categories: rating.categories,
    matched: rating.matched,
    canSwitchToNsfw: true,
    playStoreSafe: rating.playStoreSafe,
  };
}

export function sfwViolationResponse(rating: ContentRating): Response {
  return Response.json(sfwViolationPayload(rating), { status: 400 });
}
