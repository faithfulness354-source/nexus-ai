// Client + server safe profile constants.
export type AccentTheme = 'OBSIDIAN' | 'CRIMSON' | 'GOLD' | 'ARCANE' | 'VIP_AURORA' | 'VIP_ROYAL';

export const ACCENT_THEMES: Record<AccentTheme, { label: string; accent: string; glow: string; gradient: string; vip?: boolean }> = {
  OBSIDIAN: { label: 'Obsidian', accent: '#A1A1AA', glow: 'rgba(161,161,170,0.35)', gradient: 'linear-gradient(120deg,#0b0b10,#27272a,#18181b,#3f3f46,#0b0b10)' },
  CRIMSON: { label: 'Crimson', accent: '#EF4444', glow: 'rgba(239,68,68,0.4)', gradient: 'linear-gradient(120deg,#1a0508,#7f1d1d,#3b0a10,#dc2626,#1a0508)' },
  GOLD: { label: 'Gold', accent: '#F5C451', glow: 'rgba(245,196,81,0.4)', gradient: 'linear-gradient(120deg,#1a1405,#78520f,#2b2108,#f5c451,#1a1405)' },
  ARCANE: { label: 'Arcane', accent: '#8B5CF6', glow: 'rgba(139,92,246,0.45)', gradient: 'linear-gradient(120deg,#0d0820,#4c1d95,#1e1b4b,#22d3ee,#0d0820)' },
  VIP_AURORA: { label: 'VIP Aurora', vip: true, accent: '#5EEAD4', glow: 'rgba(94,234,212,0.5)', gradient: 'linear-gradient(120deg,#04121a,#0f766e,#7c3aed,#22d3ee,#f0abfc,#04121a)' },
  VIP_ROYAL: { label: 'VIP Royal', vip: true, accent: '#FCD34D', glow: 'rgba(252,211,77,0.55)', gradient: 'linear-gradient(120deg,#12051f,#6d28d9,#b45309,#fcd34d,#7e22ce,#12051f)' },
};

export function isAccentTheme(v: unknown): v is AccentTheme {
  return typeof v === 'string' && v in ACCENT_THEMES;
}

export const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

/** Face-safe default. 15% keeps the upper part of tall art in a short banner. */
export const DEFAULT_BANNER_FOCUS = 15;

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

/** Master Worldbuilder: 5+ published characters, or 25+ lorebook entries. */
export const WORLDBUILDER_MIN_CARDS = 5;
export const WORLDBUILDER_MIN_ENTRIES = 25;
