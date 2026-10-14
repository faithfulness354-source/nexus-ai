// Client + server safe profile constants.
export type AccentTheme = 'OBSIDIAN' | 'CRIMSON' | 'GOLD' | 'ARCANE' | 'VIP_AURORA' | 'VIP_ROYAL' | 'SOVEREIGN';

export const SOVEREIGN_LOCK_LABEL = 'Creator Accent — Reserved for Platform Sovereign / Admin';

export const ACCENT_THEMES: Record<AccentTheme, { label: string; accent: string; glow: string; gradient: string; vip?: boolean; sovereign?: boolean }> = {
  OBSIDIAN: { label: 'Obsidian', accent: '#A1A1AA', glow: 'rgba(161,161,170,0.35)', gradient: 'linear-gradient(120deg,#0b0b10,#27272a,#18181b,#3f3f46,#0b0b10)' },
  CRIMSON: { label: 'Crimson', accent: '#EF4444', glow: 'rgba(239,68,68,0.4)', gradient: 'linear-gradient(120deg,#1a0508,#7f1d1d,#3b0a10,#dc2626,#1a0508)' },
  GOLD: { label: 'Gold', accent: '#F5C451', glow: 'rgba(245,196,81,0.4)', gradient: 'linear-gradient(120deg,#1a1405,#78520f,#2b2108,#f5c451,#1a1405)' },
  ARCANE: { label: 'Arcane', accent: '#8B5CF6', glow: 'rgba(139,92,246,0.45)', gradient: 'linear-gradient(120deg,#0d0820,#4c1d95,#1e1b4b,#22d3ee,#0d0820)' },
  VIP_AURORA: { label: 'VIP Aurora', vip: true, accent: '#5EEAD4', glow: 'rgba(94,234,212,0.5)', gradient: 'linear-gradient(120deg,#04121a,#0f766e,#7c3aed,#22d3ee,#f0abfc,#04121a)' },
  VIP_ROYAL: { label: 'VIP Royal', vip: true, accent: '#FCD34D', glow: 'rgba(252,211,77,0.55)', gradient: 'linear-gradient(120deg,#12051f,#6d28d9,#b45309,#fcd34d,#7e22ce,#12051f)' },
  SOVEREIGN: {
    label: 'Sovereign',
    sovereign: true,
    accent: '#00f2fe',
    glow: 'rgba(0, 242, 254, 0.75)',
    gradient: 'linear-gradient(135deg, #090014 0%, #3a0094 40%, #00f2fe 100%)',
  },
};

export function isAccentTheme(v: unknown): v is AccentTheme {
  return typeof v === 'string' && v in ACCENT_THEMES;
}

export const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

/** Face-safe default. 15% keeps the upper part of tall art in a short banner. */
export const DEFAULT_BANNER_FOCUS = 15;
export const BANNER_NAME_SIZE_MIN = 1.2;
export const BANNER_NAME_SIZE_MAX = 2.5;
export const DEFAULT_BANNER_NAME_SIZE = 1.8;
export const ROYAL_BLUE_ALLOY = 'alloy';

function finiteNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number(value);
  if (value && typeof value === 'object') {
    const boxed = value as { toNumber?: () => number; toString?: () => string };
    if (typeof boxed.toNumber === 'function') {
      const n = boxed.toNumber();
      if (Number.isFinite(n)) return n;
    }
    if (typeof boxed.toString === 'function') {
      const n = Number(boxed.toString());
      if (Number.isFinite(n)) return n;
    }
  }
  return Number.NaN;
}

export function sanitizeBannerNameSize(value: unknown): number {
  const n = finiteNumber(value);
  if (!Number.isFinite(n)) return DEFAULT_BANNER_NAME_SIZE;
  return Math.min(BANNER_NAME_SIZE_MAX, Math.max(BANNER_NAME_SIZE_MIN, Math.round(n * 20) / 20));
}

export function bannerNameStyle(sizeRem: number, color: string, glow: boolean): Record<string, string | number> {
  const size = sanitizeBannerNameSize(sizeRem);
  const base = {
    fontFamily: 'var(--font-syne), sans-serif',
    fontWeight: 800,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.18em',
    fontSize: `clamp(${BANNER_NAME_SIZE_MIN}rem, var(--user-chosen-size, ${size}rem), ${BANNER_NAME_SIZE_MAX}rem)`,
    ['--user-chosen-size' as string]: `${size}rem`,
  };
  if (color === ROYAL_BLUE_ALLOY) {
    return {
      ...base,
      backgroundImage: 'linear-gradient(135deg, #1852f6 0%, #00d2ff 35%, #ffffff 50%, #00d2ff 65%, #1852f6 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      color: 'transparent',
      filter: 'drop-shadow(0px 2px 6px rgba(0, 210, 255, 0.4))',
    };
  }
  return {
    ...base,
    color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : 'inherit',
    textShadow: glow ? '-2px 0 12px rgba(0, 242, 254, 0.8), 2px 0 12px rgba(255, 0, 85, 0.6)' : 'none',
  };
}

export type ProfileBgType = 'image' | 'video';

export function sanitizeBgType(value: unknown): ProfileBgType {
  return value === 'video' ? 'video' : 'image';
}

export function sanitizeCardOpacity(value: unknown): number {
  const n = finiteNumber(value);
  if (!Number.isFinite(n)) return 35;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** http(s) media address or a same-site path. */
export function sanitizeMediaUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const raw = value.trim().slice(0, 500);
  if (!raw) return '';
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('..') && !raw.includes('\\')) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

/** `object-position` for a profile banner. Inline style overrides `object-top`. */
export function bannerFocusPosition(positionY: unknown): string {
  const n = typeof positionY === 'number' ? positionY : Number(positionY);
  const raw = Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : DEFAULT_BANNER_FOCUS;
  // Stored 0 is the untouched default from before the face-safe crop.
  const y = raw === 0 ? DEFAULT_BANNER_FOCUS : raw;
  return `50% ${y}%`;
}

export type BadgeId = 'ADMIN' | 'VIP' | 'TIER' | 'WORLDBUILDER';
export interface ProfileBadge { id: BadgeId; label: string }

export const FEATURED_CARD_MAX = 8;

export interface ProfileStyle {
  cardBlur: number;
  cardOpacity: number;
  glowColor: string;
  typeAccent: string;
  songAutoplay: boolean;
  /** Black tint over glitch video layers, 0–0.9. */
  glitchOverlayOpacity: number;
}

export interface BadgePrefs {
  order: BadgeId[];
  hidden: BadgeId[];
}

export const DEFAULT_PROFILE_STYLE: ProfileStyle = {
  cardBlur: 0,
  cardOpacity: 100,
  glowColor: '',
  typeAccent: '',
  songAutoplay: false,
  glitchOverlayOpacity: 0.5,
};

function glitchOverlayOpacity(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0.5;
  const clamped = Math.min(0.9, Math.max(0, n));
  return Math.round(clamped * 20) / 20;
}

const BADGE_IDS: BadgeId[] = ['ADMIN', 'VIP', 'TIER', 'WORLDBUILDER'];

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function hexColor(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '';
}

export function sanitizeProfileStyle(value: unknown): ProfileStyle {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    cardBlur: clamp(Number(raw.cardBlur) || 0, 0, 24),
    cardOpacity: clamp(Number(raw.cardOpacity) || 100, 40, 100),
    glowColor: hexColor(raw.glowColor),
    typeAccent: hexColor(raw.typeAccent),
    songAutoplay: raw.songAutoplay === true,
    glitchOverlayOpacity: glitchOverlayOpacity(raw.glitchOverlayOpacity),
  };
}

export function parseProfileStyle(value: unknown): ProfileStyle {
  if (typeof value !== 'string' || !value.trim()) return { ...DEFAULT_PROFILE_STYLE };
  try {
    return sanitizeProfileStyle(JSON.parse(value));
  } catch {
    return { ...DEFAULT_PROFILE_STYLE };
  }
}

/** http(s) audio address. Anything else stays blank. */
export function sanitizeSongUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const raw = value.trim().slice(0, 500);
  if (!raw) return '';
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('..') && /\.(mp3|wav|ogg|m4a|aac|webm)(\?|#|$)/i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

export function sanitizeBadgePrefs(value: unknown): BadgePrefs {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const ids = (list: unknown) => (Array.isArray(list) ? list.filter((id): id is BadgeId => BADGE_IDS.includes(id as BadgeId)) : []);
  return {
    order: Array.from(new Set(ids(raw.order))),
    hidden: Array.from(new Set(ids(raw.hidden))),
  };
}

export function parseBadgePrefs(value: unknown): BadgePrefs {
  if (typeof value !== 'string' || !value.trim()) return { order: [], hidden: [] };
  try {
    return sanitizeBadgePrefs(JSON.parse(value));
  } catch {
    return { order: [], hidden: [] };
  }
}

export function applyBadgePrefs(badges: ProfileBadge[], prefs: BadgePrefs): ProfileBadge[] {
  const hidden = new Set(prefs.hidden);
  const byId = new Map(badges.map((badge) => [badge.id, badge]));
  const ordered: ProfileBadge[] = [];
  for (const id of prefs.order) {
    const badge = byId.get(id);
    if (!badge || hidden.has(id)) {
      byId.delete(id);
      continue;
    }
    ordered.push(badge);
    byId.delete(id);
  }
  for (const badge of byId.values()) {
    if (!hidden.has(badge.id)) ordered.push(badge);
  }
  return ordered;
}

/** Master Worldbuilder: 5+ published characters, or 25+ lorebook entries. */
export const WORLDBUILDER_MIN_CARDS = 5;
export const WORLDBUILDER_MIN_ENTRIES = 25;
