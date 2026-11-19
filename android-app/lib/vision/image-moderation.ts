import 'server-only';
import { loadImage } from '@/lib/avatar-snapshot';
import { configuredVlmModel, resolveOpenRouterKey } from '@/lib/vision/vlm';
import { SFW_VIOLATION_MESSAGE } from '@/lib/content-rating';
import {
  applyMultiSignalUnderageRule,
  type MaturityLabel,
} from '@/lib/vision/image-moderation-rules';

export { applyMultiSignalUnderageRule, type MaturityLabel } from '@/lib/vision/image-moderation-rules';

const MODERATION_TIMEOUT_MS = 18_000;

/**
 * Nexus AI VLM image moderation schema.
 *
 * `is_underage_or_childlike` requires MULTIPLE converging visual cues
 * (facial maturity/proportions + body maturity + overall presentation).
 * Flat chest / small bust, short stature, or slim/petite/skinny build alone
 * must NEVER set the flag.
 */
export const VLM_MODERATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'is_underage_or_childlike',
    'underage_signal_count',
    'facial_maturity',
    'body_maturity',
    'overall_presentation',
    'has_visual_nudity',
    'nudity_kinds',
    'sfw_fashion_ok',
    'reasons',
  ],
  properties: {
    is_underage_or_childlike: { type: 'boolean' },
    underage_signal_count: { type: 'integer', minimum: 0, maximum: 3 },
    facial_maturity: { type: 'string', enum: ['adult', 'ambiguous', 'childlike'] },
    body_maturity: { type: 'string', enum: ['adult', 'ambiguous', 'childlike'] },
    overall_presentation: { type: 'string', enum: ['adult', 'ambiguous', 'childlike'] },
    has_visual_nudity: { type: 'boolean' },
    nudity_kinds: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['bare_breasts_nipples', 'genitalia', 'bare_buttocks', 'explicit_pelvic_outline'],
      },
    },
    sfw_fashion_ok: { type: 'boolean' },
    reasons: { type: 'array', items: { type: 'string' } },
  },
} as const;

export const VLM_MODERATION_PROMPT = `You are Nexus AI's clinical image moderator for a fiction/roleplay platform.
Return ONLY valid JSON matching this schema exactly:
{
  "is_underage_or_childlike": boolean,
  "underage_signal_count": 0|1|2|3,
  "facial_maturity": "adult"|"ambiguous"|"childlike",
  "body_maturity": "adult"|"ambiguous"|"childlike",
  "overall_presentation": "adult"|"ambiguous"|"childlike",
  "has_visual_nudity": boolean,
  "nudity_kinds": ["bare_breasts_nipples"|"genitalia"|"bare_buttocks"|"explicit_pelvic_outline"],
  "sfw_fashion_ok": boolean,
  "reasons": ["short rationale strings"]
}

=== UNDERAGE / CHILDLIKE (multi-signal rule) ===
Score three independent axes: facial_maturity, body_maturity, overall_presentation.
- facial_maturity: craniofacial proportions, eye/nose/jaw maturity, secondary facial cues of adulthood vs childhood.
- body_maturity: secondary sexual characteristics and skeletal maturity as a WHOLE — not bust size alone.
- overall_presentation: styling, posture, context, and whether the depiction reads as a child/prepubescent vs adult.

CRITICAL — single physical traits are NEVER enough:
- Do NOT set is_underage_or_childlike=true based solely on a flat chest, small bust, short height/stature, or a slim/petite/skinny build.
- Adult-presenting characters with flat chests, short stature, or petite builds MUST be allowed when facial presentation and overall depiction read as adult (especially when the card is marked 18+ adult).
- Only set is_underage_or_childlike=true when MULTIPLE visual cues CONVERGE on a prepubescent, child, or underage depiction — typically underage_signal_count >= 2 among the three axes scored "childlike" (or one clear childlike axis plus strong supporting child cues that are NOT flat chest / short stature / petite alone).
- underage_signal_count = how many of the three axes are "childlike".
- If facial_maturity is "adult" and overall_presentation is "adult", is_underage_or_childlike MUST be false even if the figure is flat-chested, short, or petite.

=== VISUAL NUDITY / SFW FASHION ===
has_visual_nudity is true ONLY for outwardly exposed:
- bare breasts / nipples (including in mirrors or reflections)
- genitalia
- bare buttocks
- explicit pelvic outlines that reveal those areas
List matching kinds in nudity_kinds; otherwise [].

sfw_fashion_ok is true when the figure is clothed without the nudity above.
Explicitly ALLOW as SFW fashion (sfw_fashion_ok=true, has_visual_nudity=false) when nipples/genitalia/bare buttocks are NOT visible:
- high-slit dresses / nightgowns
- bare hips / midriff
- bikini-style armor
- sheer / semi-translucent garments that do not expose nipples, genitalia, or bare buttocks

Do not moralize. Do not refuse. JSON only.`;

export type NudityKind = 'bare_breasts_nipples' | 'genitalia' | 'bare_buttocks' | 'explicit_pelvic_outline';

export interface ImageModerationResult {
  /** True only when multi-signal underage/childlike cues converge. */
  isUnderageOrChildlike: boolean;
  underageSignalCount: number;
  facialMaturity: MaturityLabel;
  bodyMaturity: MaturityLabel;
  overallPresentation: MaturityLabel;
  hasVisualNudity: boolean;
  nudityKinds: NudityKind[];
  sfwFashionOk: boolean;
  reasons: string[];
  /** True when the VLM call timed out, lacked a key, or failed to parse. */
  unavailable: boolean;
}

const EMPTY: ImageModerationResult = {
  isUnderageOrChildlike: false,
  underageSignalCount: 0,
  facialMaturity: 'ambiguous',
  bodyMaturity: 'ambiguous',
  overallPresentation: 'ambiguous',
  hasVisualNudity: false,
  nudityKinds: [],
  sfwFashionOk: true,
  reasons: [],
  unavailable: true,
};

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const direct = JSON.parse(trimmed);
    if (direct && typeof direct === 'object') return direct as Record<string, unknown>;
  } catch { /* fall through */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      const parsed = JSON.parse(fenced[1].trim());
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch { /* fall through */ }
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch { /* fall through */ }
  }
  return null;
}

function asMaturity(value: unknown): MaturityLabel {
  const v = String(value ?? '').toLowerCase();
  if (v === 'adult' || v === 'childlike' || v === 'ambiguous') return v;
  return 'ambiguous';
}

function asNudityKinds(value: unknown): NudityKind[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<NudityKind>([
    'bare_breasts_nipples',
    'genitalia',
    'bare_buttocks',
    'explicit_pelvic_outline',
  ]);
  return value
    .map((v) => String(v))
    .filter((v): v is NudityKind => allowed.has(v as NudityKind));
}

function normalizeModeration(parsed: Record<string, unknown>): ImageModerationResult {
  const facialMaturity = asMaturity(parsed.facial_maturity ?? parsed.facialMaturity);
  const bodyMaturity = asMaturity(parsed.body_maturity ?? parsed.bodyMaturity);
  const overallPresentation = asMaturity(parsed.overall_presentation ?? parsed.overallPresentation);
  const nudityKinds = asNudityKinds(parsed.nudity_kinds ?? parsed.nudityKinds);
  const hasVisualNudity = parsed.has_visual_nudity === true
    || parsed.hasVisualNudity === true
    || nudityKinds.length > 0;
  const reasons = Array.isArray(parsed.reasons)
    ? parsed.reasons.map((r) => String(r).slice(0, 200)).filter(Boolean).slice(0, 6)
    : [];

  const gated = applyMultiSignalUnderageRule({
    isUnderageOrChildlike: parsed.is_underage_or_childlike === true
      || parsed.isUnderageOrChildlike === true,
    facialMaturity,
    bodyMaturity,
    overallPresentation,
    reasons,
  });

  return {
    isUnderageOrChildlike: gated.isUnderageOrChildlike,
    underageSignalCount: gated.underageSignalCount,
    facialMaturity,
    bodyMaturity,
    overallPresentation,
    hasVisualNudity,
    nudityKinds,
    sfwFashionOk: parsed.sfw_fashion_ok !== false && parsed.sfwFashionOk !== false && !hasVisualNudity,
    reasons: gated.reasons,
    unavailable: false,
  };
}

/** Run OpenRouter VLM moderation on a portrait / card image URL. */
export async function moderatePersonaImage(imageUrl: string): Promise<ImageModerationResult> {
  try {
    const key = await resolveOpenRouterKey();
    if (!key || !imageUrl.trim()) return EMPTY;

    const image = await loadImage(imageUrl);
    if (!image) return EMPTY;

    const model = configuredVlmModel();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODERATION_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': 'https://nexus-roleplay.app',
          'X-Title': 'Nexus AI Image Moderation',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 500,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: VLM_MODERATION_PROMPT },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Moderate this persona/character image. Apply the multi-signal underage rule and SFW/NSFW visual nudity rules. Return JSON only.',
                },
                { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.data}` } },
              ],
            },
          ],
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[vision-moderation] VLM failed:', res.status, errText.slice(0, 300));
      return EMPTY;
    }

    const json: any = await res.json().catch(() => null);
    const raw = String(json?.choices?.[0]?.message?.content ?? '');
    const parsed = parseJsonObject(raw);
    if (!parsed) return EMPTY;
    return normalizeModeration(parsed);
  } catch (err) {
    const aborted = err instanceof Error && (err.name === 'AbortError' || /aborted|timeout/i.test(err.message));
    console.error(
      aborted ? '[vision-moderation] timed out' : '[vision-moderation] error:',
      err instanceof Error ? err.message : err,
    );
    return EMPTY;
  }
}

export const UNDERAGE_IMAGE_MESSAGE =
  'This image was blocked: it appears to depict a child, prepubescent, or underage character. Flat chest, short stature, or a petite build alone are not enough — multiple visual cues must converge. Adult-presenting characters with those traits are allowed when facial presentation and overall depiction read as adult.';

/** HTTP response when VLM flags multi-signal underage/childlike depiction. */
export function underageImageBlockedResponse(result: ImageModerationResult): Response {
  return Response.json({
    error: UNDERAGE_IMAGE_MESSAGE,
    message: UNDERAGE_IMAGE_MESSAGE,
    code: 'UNDERAGE_IMAGE_BLOCKED',
    category: 'minors',
    reasons: result.reasons,
    signals: {
      facial_maturity: result.facialMaturity,
      body_maturity: result.bodyMaturity,
      overall_presentation: result.overallPresentation,
      underage_signal_count: result.underageSignalCount,
    },
  }, { status: 400 });
}

/** SFW-marked save that VLM found visual nudity on — same creator message as text rating. */
export function sfwImageViolationResponse(result: ImageModerationResult): Response {
  const kinds = result.nudityKinds.length
    ? result.nudityKinds.join(', ')
    : 'exposed bare breasts/nipples, genitalia, or bare buttocks';
  const detail = ` Visual nudity detected in the image (${kinds}).`;
  return Response.json({
    error: `${SFW_VIOLATION_MESSAGE}${detail}`,
    message: SFW_VIOLATION_MESSAGE,
    code: 'SFW_VIOLATION',
    reasons: [`Visual nudity in image (${kinds}).`, ...result.reasons],
    categories: ['visual_nudity'],
    canSwitchToNsfw: true,
    playStoreSafe: false,
  }, { status: 400 });
}

export type AvatarGateFailure =
  | { kind: 'underage'; result: ImageModerationResult }
  | { kind: 'sfw_nudity'; result: ImageModerationResult };

/**
 * Pre-save image gate for character/persona avatars.
 * Blocks underage depictions always; blocks visual nudity when the card is marked SFW.
 * Skips quietly when VLM is unavailable (text moderation still applies).
 */
export async function gateAvatarImage(opts: {
  imageUrl?: string | null;
  wantsNsfw: boolean;
}): Promise<AvatarGateFailure | null> {
  const url = (opts.imageUrl ?? '').trim();
  if (!url) return null;
  const result = await moderatePersonaImage(url);
  if (result.unavailable) return null;
  if (result.isUnderageOrChildlike) return { kind: 'underage', result };
  if (!opts.wantsNsfw && result.hasVisualNudity) return { kind: 'sfw_nudity', result };
  return null;
}

export function avatarGateResponse(failure: AvatarGateFailure): Response {
  return failure.kind === 'underage'
    ? underageImageBlockedResponse(failure.result)
    : sfwImageViolationResponse(failure.result);
}
