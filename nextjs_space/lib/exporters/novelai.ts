/** NovelAI lorebook V2 document compiled from Nexus cards, lore, personas, and session metadata. */

export interface NovelContextConfig {
  prefix: string;
  suffix: string;
  tokenBudget: number;
  reservedTokens: number;
  budgetPriority: number;
  trimDirection: 'trimBottom' | 'trimTop';
  insertionType: 'newline';
  maximumTrimType: 'sentence';
  insertionPosition: number;
}

export interface NovelLoreEntry {
  id: string;
  displayName: string;
  text: string;
  keys: string[];
  enabled: boolean;
  forceActivation: boolean;
  keyRelative: boolean;
  nonStoryActivatable: boolean;
  searchRange: number;
  category: string;
  lastUpdatedAt: number;
  contextConfig: NovelContextConfig;
}

export interface NovelContextBlock {
  text: string;
  identifier: string;
  contextConfig: NovelContextConfig;
}

export interface NovelStoryMetadata {
  title: string;
  description: string;
  scenario: string;
  firstMessage: string;
  tags: string[];
  characterId: string | null;
  personas: Array<{ id: string; name: string; pronouns: string; isDefault: boolean }>;
  sessions: Array<{ id: string; title: string; model: string; provider: string; updatedAt: string | null }>;
  exportedAt: string;
}

export interface NovelAiV2Document {
  spec: 'nai_lorebook_v2';
  entries: NovelLoreEntry[];
  context: NovelContextBlock[];
  story_metadata: NovelStoryMetadata;
}

export interface ExportCharacter {
  id: string;
  name: string;
  title?: string | null;
  summary?: string | null;
  personality?: string | null;
  scenario?: string | null;
  initialMessage?: string | null;
  firstMessage?: string | null;
  systemPrompt?: string | null;
  exampleDialogue?: string | null;
  tags?: string | string[] | null;
}

export interface ExportLoreEntry {
  id: string;
  title?: string | null;
  keys?: string[] | string | null;
  content?: string | null;
  enabled?: boolean | null;
  priority?: number | null;
  depth?: number | null;
}

export interface ExportLorebook {
  id: string;
  name: string;
  description?: string | null;
  entries?: ExportLoreEntry[];
}

export interface ExportPersona {
  id: string;
  name: string;
  pronouns?: string | null;
  physical?: string | null;
  attire?: string | null;
  visualTraits?: string | null;
  personality?: string | null;
  backstory?: string | null;
  speech?: string | null;
  isDefault?: boolean | null;
}

export interface ExportSession {
  id: string;
  title?: string | null;
  model?: string | null;
  provider?: string | null;
  updatedAt?: Date | string | null;
}

export interface NovelExportSource {
  character?: ExportCharacter | null;
  lorebooks?: ExportLorebook[];
  personas?: ExportPersona[];
  sessions?: ExportSession[];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function keyList(value: ExportLoreEntry['keys']): string[] {
  if (Array.isArray(value)) return value.map((key) => text(key)).filter(Boolean).slice(0, 30);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((key) => text(key)).filter(Boolean).slice(0, 30);
  } catch {
    /* comma-separated legacy keys */
  }
  return value.split(',').map((key) => key.trim()).filter(Boolean).slice(0, 30);
}

function tagList(value: ExportCharacter['tags']): string[] {
  if (Array.isArray(value)) return value.map((tag) => text(tag)).filter(Boolean).slice(0, 30);
  return text(value).split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 30);
}

function contextConfig(priority: number, reserved = 0): NovelContextConfig {
  return {
    prefix: '',
    suffix: '\n',
    tokenBudget: 2048,
    reservedTokens: reserved,
    budgetPriority: priority,
    trimDirection: 'trimBottom',
    insertionType: 'newline',
    maximumTrimType: 'sentence',
    insertionPosition: -1,
  };
}

function contextBlock(identifier: string, body: string, priority: number): NovelContextBlock | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  return { identifier, text: trimmed, contextConfig: contextConfig(priority, identifier === 'memory' ? 512 : 0) };
}

function personaText(persona: ExportPersona): string {
  return [
    persona.name && `Name: ${persona.name}`,
    text(persona.pronouns) && `Pronouns: ${text(persona.pronouns)}`,
    text(persona.physical) && `Body: ${text(persona.physical)}`,
    text(persona.visualTraits) && `Features: ${text(persona.visualTraits)}`,
    text(persona.attire) && `Clothing: ${text(persona.attire)}`,
    text(persona.personality) && `Personality: ${text(persona.personality)}`,
    text(persona.backstory) && `Backstory: ${text(persona.backstory)}`,
    text(persona.speech) && `Speech: ${text(persona.speech)}`,
  ].filter(Boolean).join('\n');
}

function characterDefinition(character: ExportCharacter): string {
  const name = text(character.name) || 'Character';
  const title = text(character.title);
  return [
    `Name: ${name}${title ? `, ${title}` : ''}`,
    text(character.summary) && `Summary:\n${text(character.summary)}`,
    text(character.personality) && `Personality:\n${text(character.personality)}`,
    text(character.systemPrompt) && `Definition:\n${text(character.systemPrompt)}`,
  ].filter(Boolean).join('\n\n');
}

/** Builds one NovelAI V2 document from the assets tied to a save. */
export function toNovelAiV2(source: NovelExportSource, exportedAt = new Date().toISOString()): NovelAiV2Document {
  const character = source.character ?? null;
  const entries: NovelLoreEntry[] = [];
  for (const book of source.lorebooks ?? []) {
    for (const entry of book.entries ?? []) {
      const body = text(entry.content);
      if (!body) continue;
      const keys = keyList(entry.keys);
      entries.push({
        id: entry.id,
        displayName: text(entry.title) || keys[0] || book.name || 'Entry',
        text: body,
        keys,
        enabled: entry.enabled !== false,
        forceActivation: false,
        keyRelative: false,
        nonStoryActivatable: false,
        searchRange: Math.max(100, (entry.depth ?? 4) * 250),
        category: book.name,
        lastUpdatedAt: Date.parse(exportedAt) || Date.now(),
        contextConfig: contextConfig(entry.priority ?? 50),
      });
    }
  }

  const context = [
    character ? contextBlock('memory', characterDefinition(character), 0) : null,
    character ? contextBlock('scenario', text(character.scenario), -100) : null,
    character ? contextBlock('first_message', text(character.initialMessage) || text(character.firstMessage), -200) : null,
    ...(source.personas ?? []).map((persona) => contextBlock(`persona:${persona.id}`, personaText(persona), -300)),
  ].filter((block): block is NovelContextBlock => !!block);

  return {
    spec: 'nai_lorebook_v2',
    entries,
    context,
    story_metadata: {
      title: text(character?.name) || text(source.lorebooks?.[0]?.name) || text(source.personas?.[0]?.name) || 'Nexus export',
      description: text(character?.summary) || text(source.lorebooks?.[0]?.description),
      scenario: text(character?.scenario),
      firstMessage: text(character?.initialMessage) || text(character?.firstMessage),
      tags: character ? tagList(character.tags) : [],
      characterId: character?.id ?? null,
      personas: (source.personas ?? []).map((persona) => ({
        id: persona.id,
        name: persona.name,
        pronouns: text(persona.pronouns),
        isDefault: persona.isDefault === true,
      })),
      sessions: (source.sessions ?? []).map((session) => ({
        id: session.id,
        title: text(session.title) || 'New Chat',
        model: text(session.model),
        provider: text(session.provider),
        updatedAt: session.updatedAt instanceof Date ? session.updatedAt.toISOString() : text(session.updatedAt) || null,
      })),
      exportedAt,
    },
  };
}
