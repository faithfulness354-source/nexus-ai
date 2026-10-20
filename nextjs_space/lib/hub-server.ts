const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const int = (v: unknown, def: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const ids = (v: unknown) =>
  Array.isArray(v) ? (Array.from(new Set(v.filter((x) => typeof x === 'string'))) as string[]).slice(0, 200) : [];

export function packList(values: string[]): string {
  return JSON.stringify(values);
}

export function unpackList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    /* Older rows may be comma-separated. */
  }
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}

export function lorebookInput(body: any) {
  const scope = ['GLOBAL', 'CHARACTER', 'PERSONA'].includes(body?.scope) ? body.scope : 'GLOBAL';
  return {
    name: str(body?.name, 80).trim(),
    description: str(body?.description, 2000),
    scope,
    characterIds: scope === 'CHARACTER' ? ids(body?.characterIds) : [],
    personaIds: scope === 'PERSONA' ? ids(body?.personaIds) : [],
    enabled: body?.enabled !== false,
  };
}

const PLACEMENTS = ['personality', 'scenario', 'example_dialogs', 'default'] as const;

export function lorePlacement(value: unknown): (typeof PLACEMENTS)[number] {
  return typeof value === 'string' && (PLACEMENTS as readonly string[]).includes(value)
    ? value as (typeof PLACEMENTS)[number]
    : 'default';
}

export function entriesInput(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 500).map((e: any, i: number) => ({
    title: str(e?.title, 120),
    keys: (Array.isArray(e?.keys) ? e.keys : Array.isArray(e?.keywords) ? e.keywords : [])
      .filter((k: unknown) => typeof k === 'string')
      .map((k: string) => k.trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 30),
    content: str(e?.content, 8000),
    order: int(e?.order ?? e?.insertion_order, 100 + i, 0, 10000),
    priority: int(e?.priority, 50, 0, 100),
    depth: int(e?.depth ?? e?.scan_depth, 4, 1, 50),
    placement: lorePlacement(e?.placement),
    constant: e?.constant === true,
    enabled: e?.enabled !== false,
  }));
}

export function scriptInput(body: any) {
  const kind = body?.kind === 'PROMPT' ? 'PROMPT' : 'REGEX';
  const placement = ['PRE', 'POST', 'DISPLAY'].includes(body?.placement) ? body.placement : 'DISPLAY';
  return {
    name: str(body?.name, 80).trim(),
    kind,
    findPattern: str(body?.findPattern, 500),
    flags: str(body?.flags, 8).replace(/[^gimsuy]/g, '') || 'g',
    replaceWith: str(body?.replaceWith, 2000),
    placement,
    promptText: str(body?.promptText, 8000),
    enabled: body?.enabled !== false,
    order: int(body?.order, 100, 0, 10000),
  };
}
