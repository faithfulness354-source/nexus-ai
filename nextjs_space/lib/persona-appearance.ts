import { estimateTokens } from '@/lib/tokens';

/** Hard cap for the perceived-appearance system block, including its directive. */
export const VISUAL_TOKEN_CAP = 150;

export const APPEARANCE_KEYS = [
  'hairStyle', 'hairLength', 'hairTexture', 'hairDrape',
  'browShape', 'browArch', 'browDensity',
  'eyeColor', 'eyeTilt', 'irisDetail',
  'earType', 'earPiercings', 'earShape',
  'nose', 'lips', 'jawline',
  'height', 'frame',
  'bustSize', 'bustShape', 'bustFirmness',
  'waistHip', 'gluteVolume',
  'thighThickness', 'kneeTaper', 'calfSweep',
  'skinTone', 'skinMarkings',
  'garmentType', 'fitTightness', 'materialTexture', 'fabricTension', 'exposurePoints', 'drape',
] as const;

export type AppearanceKey = (typeof APPEARANCE_KEYS)[number];
export type Appearance = Record<AppearanceKey, string>;

const HEAD_KEYS: AppearanceKey[] = [
  'hairStyle', 'hairLength', 'hairTexture', 'hairDrape',
  'browShape', 'browArch', 'browDensity',
  'eyeColor', 'eyeTilt', 'irisDetail',
  'earType', 'earPiercings', 'earShape',
  'nose', 'lips', 'jawline',
];
const BODY_KEYS: AppearanceKey[] = [
  'height', 'frame', 'bustSize', 'bustShape', 'bustFirmness', 'waistHip', 'gluteVolume',
  'thighThickness', 'kneeTaper', 'calfSweep', 'skinTone', 'skinMarkings',
];
const ATTIRE_KEYS: AppearanceKey[] = [
  'garmentType', 'fitTightness', 'materialTexture', 'fabricTension', 'exposurePoints', 'drape',
];

export const APPEARANCE_GROUPS: { title: string; fields: { key: AppearanceKey; label: string; hint: string }[] }[] = [
  {
    title: 'Face and head',
    fields: [
      { key: 'hairStyle', label: 'Hair style', hint: 'Loose waves, braid, undercut' },
      { key: 'hairLength', label: 'Hair length', hint: 'Cropped, shoulder, waist' },
      { key: 'hairTexture', label: 'Hair texture', hint: 'Silk, coarse, coiled' },
      { key: 'hairDrape', label: 'Hair drape', hint: 'Over one shoulder, pinned up' },
      { key: 'browShape', label: 'Eyebrow shape', hint: 'Straight, arched, soft' },
      { key: 'browArch', label: 'Eyebrow arch', hint: 'High, gentle, flat' },
      { key: 'browDensity', label: 'Eyebrow density', hint: 'Sparse, full' },
      { key: 'eyeColor', label: 'Eye color', hint: 'Amber, grey, dark brown' },
      { key: 'eyeTilt', label: 'Eye tilt', hint: 'Almond, round, upturned' },
      { key: 'irisDetail', label: 'Iris detail', hint: 'Ringed, flecked, pale limbal' },
      { key: 'earType', label: 'Ear type', hint: 'Human, pointed' },
      { key: 'earPiercings', label: 'Ear piercings', hint: 'Studs, cuffs, none' },
      { key: 'earShape', label: 'Ear shape', hint: 'Small, elongated' },
      { key: 'nose', label: 'Nose', hint: 'Straight, broad, aquiline' },
      { key: 'lips', label: 'Lips', hint: 'Full, thin, bowed' },
      { key: 'jawline', label: 'Jawline', hint: 'Soft, square, narrow' },
    ],
  },
  {
    title: 'Body',
    fields: [
      { key: 'height', label: 'Height', hint: '5\'7", tall, petite' },
      { key: 'frame', label: 'Frame', hint: 'Narrow, broad, hourglass' },
      { key: 'bustSize', label: 'Bust / chest size', hint: 'Modest, full' },
      { key: 'bustShape', label: 'Bust / chest shape', hint: 'Round, athletic' },
      { key: 'bustFirmness', label: 'Bust / chest firmness', hint: 'Soft, firm' },
      { key: 'waistHip', label: 'Waist-to-hip curve', hint: 'Straight, pronounced' },
      { key: 'gluteVolume', label: 'Glute volume', hint: 'Slight, full' },
      { key: 'thighThickness', label: 'Thigh thickness', hint: 'Slim, thick' },
      { key: 'kneeTaper', label: 'Taper into the knee', hint: 'Sharp, gradual' },
      { key: 'calfSweep', label: 'Calf sweep', hint: 'Slim, defined' },
      { key: 'skinTone', label: 'Skin tone', hint: 'Warm olive, deep brown' },
      { key: 'skinMarkings', label: 'Skin markings', hint: 'Freckles, scars, tattoos' },
    ],
  },
  {
    title: 'Outfit',
    fields: [
      { key: 'garmentType', label: 'Garment type', hint: 'Coat, dress, armor' },
      { key: 'fitTightness', label: 'Fit tightness', hint: 'Loose, tailored, tight' },
      { key: 'materialTexture', label: 'Material texture', hint: 'Linen, leather, knit' },
      { key: 'fabricTension', label: 'Fabric tension', hint: 'Slack, stretched' },
      { key: 'exposurePoints', label: 'Skin exposure', hint: 'Collar, sleeves, midriff' },
      { key: 'drape', label: 'Sag, drape, or cling', hint: 'Clings at the hip, hangs straight' },
    ],
  },
];

export function emptyAppearance(): Appearance {
  return Object.fromEntries(APPEARANCE_KEYS.map((key) => [key, ''])) as Appearance;
}

export function parseAppearance(value: unknown): Appearance {
  const base = emptyAppearance();
  let raw: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return base;
    try { raw = JSON.parse(trimmed); } catch { return base; }
  }
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Record<string, unknown>;
  for (const key of APPEARANCE_KEYS) {
    if (typeof src[key] === 'string') base[key] = src[key].trim().slice(0, 80);
  }
  return base;
}

function phrase(label: string, keys: AppearanceKey[], appearance: Appearance): string {
  const values = keys.map((key) => appearance[key]).filter(Boolean);
  return values.length ? `${label}: ${values.join(', ')}.` : '';
}

function capTokens(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  const maxChars = Math.max(0, maxTokens * 4);
  const slice = text.slice(0, maxChars);
  const space = slice.lastIndexOf(' ');
  return (space > maxChars * 0.6 ? slice.slice(0, space) : slice).replace(/[,;:\s]+$/, '');
}

/**
 * High-priority visual block for the active persona.
 * Structured fields, leftover freeform notes, and the cached avatar reading share one 150-token cap.
 */
export function compilePerceivedAppearance(persona: {
  name?: string | null;
  pronouns?: string | null;
  physical?: string | null;
  attire?: string | null;
  visualTraits?: string | null;
  appearance?: unknown;
  avatarSnapshot?: string | null;
}): string {
  const appearance = parseAppearance(persona.appearance);
  const head = phrase('Face', HEAD_KEYS, appearance);
  const body = phrase('Body', BODY_KEYS, appearance);
  const outfit = phrase('Outfit', ATTIRE_KEYS, appearance);
  const facts = [
    [persona.name?.trim() || '{{user}}', persona.pronouns?.trim()].filter(Boolean).join(', '),
    head,
    !head && persona.physical?.trim() ? persona.physical.trim() : '',
    body,
    !body && persona.visualTraits?.trim() ? persona.visualTraits.trim() : '',
    outfit,
    !outfit && persona.attire?.trim() ? persona.attire.trim() : '',
    persona.avatarSnapshot?.trim() ? `Portrait: ${persona.avatarSnapshot.trim()}` : '',
  ].filter(Boolean).join(' ');

  const header = '[PERCEIVED VISUAL APPEARANCE & PHYSICALITY OF {{user}}]';
  const directive = 'Maintain total spatial and visual awareness of {{user}}\'s complete appearance, outfit drape, facial expressions, and body language during roleplay. Do not speak or act for them.';
  const room = Math.max(24, VISUAL_TOKEN_CAP - estimateTokens(`${header}\n${directive}`));
  const bodyText = capTokens(facts, room);
  return [header, bodyText, directive].filter(Boolean).join('\n');
}
