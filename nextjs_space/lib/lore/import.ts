import { extractCardFromPng, isPng } from '@/lib/png-card';
import { lorePlacement } from '@/lib/hub-server';

export interface ImportedLoreEntry {
  title: string;
  keywords: string[];
  content: string;
  insertion_order: number;
  priority: number;
  scan_depth: number;
  placement: 'personality' | 'scenario' | 'example_dialogs' | 'default';
  enabled: boolean;
  constant: boolean;
}

const MAX_ENTRIES = 500;

function text(value: unknown, max = 8000): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function keywordsOf(item: Record<string, unknown>): string[] {
  const raw = item.keywords ?? item.keys ?? item.key ?? item.keysRaw;
  const parts = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = text(part, 80).trim();
    const folded = key.toLowerCase();
    if (!key || seen.has(folded)) continue;
    seen.add(folded);
    out.push(key);
    if (out.length >= 30) break;
  }
  return out;
}

function numberOf(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function placementOf(item: Record<string, unknown>): ImportedLoreEntry['placement'] {
  const named = lorePlacement(item.placement);
  if (typeof item.placement === 'string') return named;
  const position = item.position;
  if (position === 0 || position === 'before_char' || position === 'personality') return 'personality';
  if (position === 'scenario') return 'scenario';
  if (position === 'example_dialogs' || position === 'example') return 'example_dialogs';
  return 'default';
}

function mapEntry(item: unknown, index: number): ImportedLoreEntry | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const row = item as Record<string, unknown>;
  const content = text(row.content);
  if (!content.trim()) return null;
  return {
    title: text(row.name ?? row.title ?? row.comment, 120).trim(),
    keywords: keywordsOf(row),
    content,
    insertion_order: numberOf(row.insertion_order ?? row.order, 100 + index, 0, 10000),
    priority: numberOf(row.priority ?? row.weight, 50, 0, 100),
    scan_depth: numberOf(row.scan_depth ?? row.depth ?? row.scanDepth, 4, 1, 50),
    placement: placementOf(row),
    enabled: row.enabled !== false && row.disable !== true,
    constant: row.constant === true,
  };
}

function entryList(root: unknown): unknown[] {
  if (Array.isArray(root)) return root;
  if (!root || typeof root !== 'object') return [];
  const obj = root as Record<string, unknown>;
  if (Array.isArray(obj.entries)) return obj.entries;
  if (obj.entries && typeof obj.entries === 'object') return Object.values(obj.entries as object);
  const data = obj.data && typeof obj.data === 'object' ? obj.data as Record<string, unknown> : null;
  const book = obj.character_book ?? data?.character_book ?? obj.lorebook ?? data?.lorebook;
  if (book) return entryList(book);
  if (obj.content || obj.keys || obj.key || obj.keysRaw || obj.keywords) return [obj];
  return [];
}

/** Maps a SillyTavern, Janitor, or character-card world-info document onto lore entries. */
export function parseLoreJson(root: unknown): ImportedLoreEntry[] {
  const rows = entryList(root);
  const entries: ImportedLoreEntry[] = [];
  for (let i = 0; i < rows.length && entries.length < MAX_ENTRIES; i++) {
    const mapped = mapEntry(rows[i], i);
    if (mapped) entries.push(mapped);
  }
  return entries;
}

/** Reads a .json document or a PNG with chara / spec_v2 tEXt metadata. */
export function parseLoreFile(buf: Buffer): ImportedLoreEntry[] {
  if (isPng(buf)) {
    const found = extractCardFromPng(buf);
    if (!found) throw new Error('This PNG has no chara or spec_v2 world info.');
    const entries = parseLoreJson(found.card);
    if (!entries.length) throw new Error('The card has no lorebook entries.');
    return entries;
  }
  const text = buf.toString('utf8').replace(/^\uFEFF/, '').trim();
  if (!text.startsWith('{') && !text.startsWith('[')) throw new Error('Upload a .json lorebook or a character-card .png.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That JSON could not be parsed.');
  }
  const entries = parseLoreJson(parsed);
  if (!entries.length) throw new Error('No lore entries were found in that file.');
  return entries;
}
