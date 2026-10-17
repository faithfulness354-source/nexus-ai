export interface WorldStats {
  trust: number;
  inventory: string[];
  house: string;
  alignment: string;
}

export interface WorldStateRow {
  sessionId: string;
  stats: WorldStats;
  unlockedAchievements: string[];
}

export interface WorldToolCall {
  name: 'update_world_state' | 'add_memory';
  args: Record<string, unknown>;
}

export const DEFAULT_STATS: WorldStats = {
  trust: 0,
  inventory: [],
  house: '',
  alignment: '',
};

const TRUST_MIN = -100;
const TRUST_MAX = 100;

export function normalizeStats(value: unknown): WorldStats {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    trust: clampTrust(raw.trust),
    inventory: stringList(raw.inventory, 40, 80),
    house: shortText(raw.house, 120),
    alignment: shortText(raw.alignment, 120),
  };
}

export function normalizeAchievements(value: unknown): string[] {
  return stringList(value, 40, 80);
}

export function worldPatchFromArgs(args: unknown): { stats: Partial<WorldStats>; achievements: string[] } | null {
  if (!args || typeof args !== 'object') return null;
  const raw = args as Record<string, unknown>;
  const stats: Partial<WorldStats> = {};
  if (raw.trust !== undefined && raw.trust !== null && raw.trust !== '') stats.trust = clampTrust(raw.trust);
  if (Array.isArray(raw.inventory)) stats.inventory = stringList(raw.inventory, 40, 80);
  if (typeof raw.house === 'string' && raw.house.trim()) stats.house = shortText(raw.house, 120);
  if (typeof raw.alignment === 'string' && raw.alignment.trim()) stats.alignment = shortText(raw.alignment, 120);
  const achievements = stringList(raw.unlock_achievements ?? raw.unlocked_achievements, 20, 80);
  if (!Object.keys(stats).length && !achievements.length) return null;
  return { stats, achievements };
}

export function memoryFromArgs(args: unknown): string | null {
  if (!args || typeof args !== 'object') return null;
  const content = shortText((args as Record<string, unknown>).content, 1000);
  if (content.length < 12) return null;
  return content;
}

/** Canon block injected into the system prompt after the character card. */
export function formatWorldContext(state: WorldStateRow, memories: string[]): string {
  const stats = {
    trust: state.stats.trust,
    inventory: state.stats.inventory,
    house: state.stats.house,
    alignment: state.stats.alignment,
    unlocked_achievements: state.unlockedAchievements,
  };
  const memoryText = memories.length
    ? memories.map((memory, index) => `${index + 1}. ${memory}`).join('\n')
    : 'none';
  return `[CURRENT WORLD STATE]: ${JSON.stringify(stats)}\n[RELEVANT MEMORIES]: ${memoryText}`;
}

function clampTrust(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(TRUST_MIN, Math.min(TRUST_MAX, Math.round(n)));
}

function shortText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function stringList(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = shortText(item, maxLen);
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}
