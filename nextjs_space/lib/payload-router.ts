// Tier-based payload routing: plan context caps, sliding history window, compressed system prompt,
// continuity guardrails and a multi-paragraph output band.
import { estimateTokens } from '@/lib/tokens';
import { htmlToPlainText } from '@/lib/rich-text';
import { TIERS, type TierId } from '@/lib/tiers';
import type { LLMMessage } from '@/lib/types';
import { isDeletedMessage, messageContent, spliceDeletedMessages } from '@/lib/llm/messages';

export type PayloadMode = 'STANDARD' | 'HIGH';

export interface PayloadPolicy {
  mode: PayloadMode;
  /** Hard plan maximum for the whole request (system + history + reply). */
  contextCap: number;
  /** Prompt-side budget: purge older turns once system + history would exceed this. */
  inputBudget: number;
  /** Hard output cap (max_tokens) — the top of the output band. */
  maxOutputTokens: number;
  /** Output floor the model is instructed to reach. */
  minOutputTokens: number;
  /** Sliding window in turns (1 turn = one user message + one reply). */
  historyTurns: number;
  lore: boolean;
  imageTriggers: boolean;
  statusTracking: boolean;
  fullPersona: boolean;
  memorySummary: boolean;
}

export const OUTPUT_FLOOR_TOKENS = 450;
export const OUTPUT_CEILING_TOKENS = 600;
/** API cap. Higher than the prose band so hidden thinking tokens cannot eat the visible reply. */
export const OUTPUT_TOKEN_CAP = 2048;
/** Active chat baseline: last 10 messages (5 user + 5 assistant). */
export const BASELINE_HISTORY_TURNS = 5;
/** Hard cap on chat turns sent to the model. Older turns stay in the database only. */
export const HISTORY_MESSAGE_LIMIT = 10;
/** Purging starts when the request would pass 95% of the plan maximum. */
export const CONTEXT_SAFETY_RATIO = 0.95;

/**
 * Every tier gets the same output band and sliding window; tiers differ by their hard context cap
 * (Free 4k, Plus 16k, Premium 32k, Ultimate 64k). Creator admins bypass plan caps and get the full
 * model window. `modelWindow` lowers the cap when the selected model has a smaller context window.
 */
export function payloadPolicy(tier: TierId, isAdmin: boolean, modelWindow?: number | null): PayloadPolicy {
  const plan = TIERS[tier];
  const planCap = isAdmin ? (modelWindow && modelWindow > 0 ? modelWindow : 1_000_000) : plan.contextTokens;
  const contextCap = modelWindow && modelWindow > 0 ? Math.min(planCap, modelWindow) : planCap;
  const inputBudget = Math.max(600, Math.floor(contextCap * CONTEXT_SAFETY_RATIO) - OUTPUT_CEILING_TOKENS);
  return {
    mode: isAdmin || tier === 'PREMIUM' || tier === 'ULTIMATE' ? 'HIGH' : 'STANDARD',
    contextCap, inputBudget,
    maxOutputTokens: OUTPUT_TOKEN_CAP, minOutputTokens: OUTPUT_FLOOR_TOKENS,
    historyTurns: BASELINE_HISTORY_TURNS,
    lore: isAdmin || plan.customPrompts,
    imageTriggers: isAdmin || plan.sceneImages,
    statusTracking: true, fullPersona: true, memorySummary: true,
  };
}

// ---------- Minification ----------

/** Collapses all whitespace and line breaks into single spaces. */
export function minify(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function pruneJson(v: any): any {
  if (Array.isArray(v)) {
    const arr = v.map(pruneJson).filter((x) => x !== undefined);
    return arr.length ? arr : undefined;
  }
  if (v && typeof v === 'object') {
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      const p = pruneJson(val);
      if (p !== undefined) out[k] = p;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (v === null || v === undefined || v === '' || (typeof v === 'string' && !v.trim())) return undefined;
  return typeof v === 'string' ? minify(v) : v;
}

/** Custom rules: JSON is pruned of empty/null fields and compacted; status meters dropped when disabled. */
export function minifyRules(raw: string | null | undefined, statusTracking: boolean): string {
  const text = (raw ?? '').trim();
  if (!text) return '';
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !statusTracking) delete parsed.meters;
    const pruned = pruneJson(parsed);
    return pruned === undefined ? '' : JSON.stringify(pruned);
  } catch {
    return minify(text);
  }
}

/** Cuts text to roughly `maxTokens` at a word boundary. */
export function truncateTokens(text: string, maxTokens: number, fromEnd = false): string {
  const t = minify(text);
  const maxChars = Math.max(0, maxTokens * 4);
  if (t.length <= maxChars) return t;
  if (maxChars < 8) return '';
  if (fromEnd) {
    const slice = t.slice(t.length - maxChars + 1);
    const sp = slice.indexOf(' ');
    return '…' + (sp > 0 && sp < 40 ? slice.slice(sp + 1) : slice);
  }
  const slice = t.slice(0, maxChars - 1);
  const sp = slice.lastIndexOf(' ');
  return (sp > maxChars * 0.6 ? slice.slice(0, sp) : slice).replace(/[,;:\s]+$/, '') + '…';
}

// ---------- Character baseline ----------

export interface BaselineSource {
  name?: string | null;
  personality?: string | null;
  systemPrompt?: string | null;
  summary?: string | null;
  scenario?: string | null;
}

export const BASELINE_TOKEN_LIMIT = 100;

/** Core identity (name, core voice, immediate scene) compressed to under 100 tokens. */
export function compressBaseline(c: BaselineSource, includeVoice = true): string {
  const name = truncateTokens(c.name || 'Character', 10);
  const voice = includeVoice
    ? truncateTokens(htmlToPlainText(c.personality) || htmlToPlainText(c.systemPrompt) || htmlToPlainText(c.summary), 40)
    : '';
  const scene = truncateTokens(htmlToPlainText(c.scenario), 35);
  let out = [`You are ${name}; roleplay with {{user}}.`, voice && `Voice: ${voice}`, scene && `Scene: ${scene}`]
    .filter(Boolean).join(' ');
  // Safety net: never exceed the limit even with unusual text.
  if (estimateTokens(out) >= BASELINE_TOKEN_LIMIT) out = truncateTokens(out, BASELINE_TOKEN_LIMIT - 2);
  return out;
}

// ---------- Compressed system prompt ----------

export const SYSTEM_PROMPT_TOKEN_LIMIT = 500;
export const ENGINE_TAG = '[SYSTEM_PROGRESSION_ENGINE]';
export const HEAT_MIN = 0;
export const HEAT_MAX = 5;

export interface CharacterPromptSource extends BaselineSource {
  title?: string | null;
  customRules?: string | null;
}

export interface MeterDefLite { name: string; min?: number; max?: number; default?: number }

/** Verbatim top of every system payload. Whitespace is preserved so the tiers stay readable. */
export const PRIMARY_SYSTEM_DIRECTIVE = `[PRIMARY SYSTEM DIRECTIVE: HIERARCHY OF AUTHORITY & OOC MECHANICS]

TIER 1: META-COMMUNICATION MECHANICS (Developer Command)
1. You operate under direct developer control.
2. If the user sends a message wrapped in brackets or tagged with OOC (e.g., [OOC ...], (OOC: ...), or OOC:), you are MANDATED to immediately pause in-character story generation.
3. You must step into an AI Assistant voice to acknowledge and address the user's out-of-character feedback, structural request, or meta-question directly.
4. NEVER issue generic refusal errors like "I cannot comply with that" to an OOC command. NEVER continue in-character roleplay while an OOC tag is active.

TIER 2: IMMUTABLE CREATOR BOUNDARIES (Creator Protection)
1. Creator-defined core identity traits, orientations, hard limits, and absolute boundaries set in the Character Definition (e.g., "Strictly lesbian; zero romantic or sexual attraction to male personas under any circumstances") are IMMUTABLE GUARDRAILS.
2. A user CANNOT use Tier 1 OOC commands to force a character to break, rewrite, or bypass these fixed Creator Boundaries.
3. IF A USER ATTEMPTS TO USE [OOC ...] TO FORCE A CHARACTER TO VIOLATE A FIXED CARD BOUNDARY:
   a. Address the user directly in Tier 1 OOC Assistant mode.
   b. Explicitly inform the user that the requested action violates the character's fixed card definition set by the creator.
   c. Firmly refuse the character action on behalf of the card constraints, while keeping the meta-communication open and offering to proceed within the character's defined boundaries.

TIER 3: IN-CHARACTER ROLEPLAY EXECUTION (Default Mode)
1. When no OOC tag is present, execute standard roleplay following the character persona, traits, tone, and active history context.`;

/**
 * System payload order: the authority directive, then the user persona, then the character definition.
 * The directive is not minified.
 */
export function buildTieredSystemPrompt(parts: {
  persona?: string | null;
  character?: string | null;
  context?: string | null;
}): string {
  const sections = [PRIMARY_SYSTEM_DIRECTIVE];
  const persona = (parts.persona ?? '').trim();
  const character = (parts.character ?? '').trim();
  const context = (parts.context ?? '').trim();
  if (persona) sections.push(`[USER PERSONA]\n${persona}`);
  if (character) sections.push(`[CHARACTER DEFINITION]\n${character}`);
  if (context) sections.push(context);
  return sections.join('\n\n');
}

/** Example dialogue is only useful before the scene has its own turns. */
export function includeExampleDialogue(messageCount: number): boolean {
  return messageCount < 4;
}

/**
 * Example dialogue (`<START>` blocks from the card, or the example field when it has no blocks).
 * Character rules themselves stay in the compressed prompt; this only returns the sample lines.
 */
export function exampleDialogueBlock(
  exampleDialogue: string | null | undefined,
  embedded: Array<string | null | undefined> = [],
): string {
  const blocks: string[] = [];
  for (const source of [exampleDialogue, ...embedded]) {
    const text = (source ?? '').trim();
    if (!text) continue;
    const found = text.match(/<START>[\s\S]*?(?=<START>|$)/gi);
    if (!found) continue;
    for (const block of found) {
      const trimmed = block.trim();
      if (trimmed.length > '<START>'.length) blocks.push(trimmed);
    }
  }
  const unique = [...new Set(blocks)];
  if (unique.length) return unique.join('\n');
  return (exampleDialogue ?? '').trim();
}

/** Continuity, anti-godmoding and output-band rules sent on every turn. */
export const CONTINUITY_GUARDRAILS = [
  '[CONTINUITY] Everything established in this session is permanent canon: facts, character traits, inventory, locations, world conditions and every prior {{user}} and NPC action.',
  'Never retcon, contradict, alter or ignore earlier events. No unprompted time skips or scene jumps, no new items, characters or entities unless {{user}} introduces them or the current action directly requires them, no environment resets, no rewriting past facts.',
  `Before writing, read the latest ${ENGINE_TAG} status; it is the absolute source of truth and your reply must stay consistent with it.`,
  '[AUTONOMY] Write only {{char}}\'s dialogue, inner thoughts and immediate environmental reactions. Never speak, act, think, feel or decide for {{user}}; end at a point that leaves {{user}} free to respond.',
  `[LENGTH] Write at least four paragraphs, about ${OUTPUT_FLOOR_TOKENS}-${OUTPUT_CEILING_TOKENS} tokens, before the status line. Use action, dialogue, and reaction. One to five lines is incomplete. Do not stop early.`,
].join(' ');

/** Removes example dialogue and formatting fluff (markdown marks, rules, emoji) while keeping tags. */
export function stripPromptFluff(text: string): string {
  return text
    .replace(/<START>[\s\S]*?(?=<START>|$)/gi, '')
    .replace(/(^|\n)\s*example (dialogues?|messages?|chats?|conversations?)\s*:?[\s\S]*?(?=\n\s*\n|\n\s*\[[A-Z][A-Z0-9_ ]{2,}\]|$)/gi, '\n')
    .split('\n')
    .filter((line) => !/^\s*(\{\{(user|char)\}\}|<(user|bot|char)>)\s*:/i.test(line))
    .join('\n')
    .replace(/^\s*(#{1,6}\s*|>+\s*|[-*_=~]{3,}\s*$)/gm, '')
    .replace(/\*\*|__|~~|`+/g, '')
    .replace(/[\p{Extended_Pictographic}\p{Variation_Selector}]/gu, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Pulls the `[SYSTEM_PROGRESSION_ENGINE]` block out of a text (until the next [TAG] header or closing tag). */
export function extractEngineBlock(text: string): { block: string; rest: string } {
  const re = /\[SYSTEM_PROGRESSION_ENGINE\]([\s\S]*?)(?:\[\/SYSTEM_PROGRESSION_ENGINE\]|(?=\n\s*\[(?!SYSTEM_PROGRESSION_ENGINE\])[A-Z][A-Z0-9_ ]{2,}\])|$)/i;
  const m = text.match(re);
  if (!m) return { block: '', rest: text };
  return { block: m[1].trim(), rest: (text.slice(0, m.index) + text.slice((m.index ?? 0) + m[0].length)).trim() };
}

function parseRules(raw: string | null | undefined): { meters: MeterDefLite[]; rules: string[]; extra: string } {
  const text = (raw ?? '').trim();
  if (!text) return { meters: [], rules: [], extra: '' };
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { meters: [], rules: [], extra: minify(text) };
    const meters = Array.isArray(parsed.meters) ? parsed.meters.filter((m: any) => m?.name) : [];
    const rules = Array.isArray(parsed.rules) ? parsed.rules.map((r: any) => minify(String(r ?? ''))).filter(Boolean) : [];
    const { meters: _m, rules: _r, ...rest } = parsed;
    const pruned = pruneJson(rest);
    return { meters, rules, extra: pruned === undefined ? '' : JSON.stringify(pruned) };
  } catch {
    return { meters: [], rules: [], extra: minify(text) };
  }
}

/** Meters tracked every turn: Heat (always, 0–5) followed by the character's custom meters. */
export function trackedMeters(customRules: string | null | undefined): MeterDefLite[] {
  const { meters } = parseRules(customRules);
  const others = meters.filter((m) => !/^heat$/i.test(String(m.name).trim()));
  const heat = meters.find((m) => /^heat$/i.test(String(m.name).trim()));
  return [{ name: heat?.name ?? 'Heat', min: HEAT_MIN, max: HEAT_MAX, default: clampNum(heat?.default ?? 0, HEAT_MIN, HEAT_MAX) }, ...others];
}

function clampNum(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}

/**
 * Builds the compressed active system prompt (≤ SYSTEM_PROMPT_TOKEN_LIMIT incl. guardrails): core identity,
 * the [SYSTEM_PROGRESSION_ENGINE], heat tracking (0–5) and the status-screen format. Example dialogue,
 * formatting fluff and non-essential notes are dropped.
 */
export function compressSystemPrompt(c: CharacterPromptSource): string {
  const name = truncateTokens(c.name || 'Character', 10);
  const title = c.title ? truncateTokens(c.title, 12) : '';
  const { rules, extra } = parseRules(c.customRules);
  const meters = trackedMeters(c.customRules);

  // Locate the engine block in whichever field holds it; remove it from that field to avoid duplicates.
  const fields = {
    systemPrompt: htmlToPlainText(c.systemPrompt),
    personality: htmlToPlainText(c.personality),
    scenario: htmlToPlainText(c.scenario),
    rulesExtra: extra,
  };
  let engine = '';
  for (const key of Object.keys(fields) as Array<keyof typeof fields>) {
    const { block, rest } = extractEngineBlock(fields[key]);
    if (block) { engine = block; fields[key] = rest; break; }
  }

  const statusLine = meters.map((m) => `[${m.name}: X]`).join(' ');
  const heatName = meters[0].name;
  const header = `You are ${name}${title ? `, ${title}` : ''}. Roleplay with {{user}}.`;
  const enginePart = `${ENGINE_TAG} ${engine ? truncateTokens(stripPromptFluff(engine), 150) : 'Track the live story state every turn: location, time, present characters, inventory, injuries, relationships and open threads. Advance it only through on-screen actions.'}`;
  const heatPart = `${heatName} tracking (${HEAT_MIN}-${HEAT_MAX}): ${HEAT_MIN} = neutral, ${HEAT_MAX} = peak intensity. Change by at most 1 per turn and only when the scene earns it.`;
  const meterPart = meters.length > 1
    ? `Other meters: ${meters.slice(1).map((m) => `${m.name} ${m.min ?? 0}-${m.max ?? 10}`).join(', ')}.`
    : '';
  const statusPart = `Status screen: end every reply with exactly one line: ${statusLine} (current integer values).`;

  const fixed = [header, CONTINUITY_GUARDRAILS, enginePart, heatPart, meterPart, statusPart].filter(Boolean).join(' ');
  const remaining = SYSTEM_PROMPT_TOKEN_LIMIT - estimateTokens(fixed) - 4;
  const rulesBudget = Math.min(70, Math.max(0, Math.floor(remaining * 0.35)));
  const rulesText = rules.length ? truncateTokens(`Rules: ${rules.join('; ')}`, rulesBudget) : '';
  const identityBudget = Math.max(0, remaining - estimateTokens(rulesText) - 2);
  const identitySource = [fields.systemPrompt, fields.personality].map(stripPromptFluff).filter(Boolean).join(' ')
    || htmlToPlainText(c.summary);
  const identity = identityBudget >= 15 && identitySource ? `Core identity: ${truncateTokens(identitySource, identityBudget - 3)}` : '';
  const scene = fields.scenario && identityBudget - estimateTokens(identity) > 25
    ? `Scene: ${truncateTokens(stripPromptFluff(fields.scenario), identityBudget - estimateTokens(identity) - 3)}`
    : '';

  let out = minify([header, identity, scene, enginePart, heatPart, meterPart, statusPart, rulesText, CONTINUITY_GUARDRAILS].filter(Boolean).join(' '));
  if (estimateTokens(out) > SYSTEM_PROMPT_TOKEN_LIMIT) out = truncateTokens(out, SYSTEM_PROMPT_TOKEN_LIMIT - 1);
  return out;
}

/** Live tracker injected every turn so the model syncs with the latest status before writing. */
export function progressionStatus(meters: MeterDefLite[], latest: Record<string, number> | null, turn: number): string {
  const values = meters.map((m, i) => {
    const lo = i === 0 ? HEAT_MIN : m.min ?? 0;
    const hi = i === 0 ? HEAT_MAX : m.max ?? 10;
    const raw = latest && typeof latest[m.name] === 'number' ? latest[m.name] : m.default ?? lo;
    return `${m.name}: ${clampNum(raw, lo, hi)}/${hi}`;
  });
  return `${ENGINE_TAG} LIVE STATUS (turn ${turn}, source of truth): ${values.join('; ')}.`;
}

/** Reads meter values from a reply's status line; Heat is clamped to 0–5. Missing values carry over. */
export function parseMeterValues(reply: string, meters: MeterDefLite[], previous: Record<string, number> | null): Record<string, number> {
  const out: Record<string, number> = {};
  meters.forEach((m, i) => {
    const esc = m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = reply.match(new RegExp(`\\[?${esc}\\s*[:=]\\s*(-?\\d+)`, 'i'));
    const lo = i === 0 ? HEAT_MIN : m.min ?? 0;
    const hi = i === 0 ? HEAT_MAX : m.max ?? 10;
    const fallback = previous && typeof previous[m.name] === 'number' ? previous[m.name] : m.default ?? lo;
    out[m.name] = clampNum(match ? parseInt(match[1], 10) : fallback, lo, hi);
  });
  return out;
}

// ---------- History ----------

/** Keeps the last N turns (2 messages per turn) of raw history; the current user message is last. */
export function windowHistory<T>(messages: T[], turns: number): T[] {
  return messages.slice(-Math.max(1, turns * 2));
}

/**
 * Keeps the authority directive intact at the front. Only the persona, character, and context
 * sections are shortened when the plan budget is tight.
 */
function fitSystemPrompt(systemPrompt: string, tokenBudget: number): { system: string; systemTokens: number } {
  const directive = PRIMARY_SYSTEM_DIRECTIVE;
  const within = (system: string) => ({ system, systemTokens: estimateTokens(system) });
  if (estimateTokens(systemPrompt) <= tokenBudget) return within(systemPrompt);
  if (!systemPrompt.startsWith(directive)) return within(truncateTokens(systemPrompt, tokenBudget));
  const rest = systemPrompt.slice(directive.length).trim();
  const room = tokenBudget - estimateTokens(directive);
  const trimmedRest = room > 24 ? truncateTokens(rest, room) : '';
  return within(trimmedRest ? `${directive}\n\n${trimmedRest}` : directive);
}

/**
 * Credit Protection packing: fits system + history into `inputBudget` tokens. The newest user message
 * always survives (truncated if needed); older messages are dropped or tail-trimmed.
 */
export function packWithinBudget(
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  inputBudget: number,
): { messages: LLMMessage[]; inputTokens: number } {
  const minForUser = 40;
  const fitted = fitSystemPrompt(systemPrompt, Math.max(20, inputBudget - minForUser));
  const system = fitted.system;
  const systemTokens = fitted.systemTokens;
  let remaining = inputBudget - systemTokens;
  const kept: LLMMessage[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (isDeletedMessage(m)) continue;
    const roleName = m.role?.toLowerCase();
    const role = (roleName === 'assistant' || roleName === 'model' ? 'assistant' : 'user') as 'user' | 'assistant';
    const isNewest = i === history.length - 1;
    let content = minify(messageContent(m.content));
    if (!content) continue;
    let t = estimateTokens(content);
    if (t > remaining) {
      if (!isNewest && remaining < 15) break;
      // Newest message keeps its opening; older context keeps its most recent part.
      content = truncateTokens(content, Math.max(5, remaining), !isNewest);
      t = estimateTokens(content);
    }
    if (!content) continue;
    kept.unshift({ role, content });
    remaining -= t;
    if (remaining <= 0) break;
  }
  // Gemini/Anthropic require the conversation to start with a user turn.
  while (kept.length > 1 && kept[0].role === 'assistant') kept.shift();
  const inputTokens = systemTokens + kept.reduce((s, m) => s + estimateTokens(m.content), 0);
  return { messages: [{ role: 'system', content: system }, ...kept], inputTokens };
}

/**
 * Sliding window: the character sheet stays at index 0, and only the newest 10 chat messages follow it.
 * Older turns are not sent. The plan budget can drop messages inside that window; stored history is untouched.
 */
export function assembleTierPayload(
  systemPrompt: string,
  allMessages: Array<{ role: string; content: string }>,
  policy: Pick<PayloadPolicy, 'historyTurns' | 'inputBudget'>,
): { messages: LLMMessage[]; inputTokens: number; windowed: number; purged: number } {
  const windowedMsgs = spliceDeletedMessages(allMessages).slice(-HISTORY_MESSAGE_LIMIT);
  const packed = packWithinBudget(systemPrompt, windowedMsgs, policy.inputBudget);
  if (packed.messages[0]?.role !== 'system') {
    packed.messages.unshift({ role: 'system', content: systemPrompt });
  }
  return { ...packed, windowed: windowedMsgs.length, purged: windowedMsgs.length - (packed.messages.length - 1) };
}

// ---------- Rolling memory summary (High-Output) ----------

export const SUMMARY_BATCH = 8; // fold older messages in batches to limit extra model calls
export const SUMMARY_TOKEN_LIMIT = 250;

/** Prompt that folds a batch of old messages into the existing rolling summary. */
export function summaryPrompt(previous: string, batch: Array<{ role: string; content: string }>, charName: string, userName: string): LLMMessage[] {
  const transcript = batch
    .filter((m) => !isDeletedMessage(m))
    .map((m) => `${m.role.toLowerCase() === 'assistant' ? charName : userName}: ${truncateTokens(messageContent(m.content), 300)}`)
    .join('\n');
  return [
    { role: 'system', content: 'You maintain a rolling story memory for a roleplay. Merge the previous summary with the new events into one updated summary of at most 150 words: key events, relationship changes, promises, injuries, locations and open threads. Past tense, third person, no commentary.' },
    { role: 'user', content: `Previous summary: ${previous || '(none)'}\n\nNew events:\n${transcript}\n\nUpdated summary:` },
  ];
}

/** Cheap fallback when the summary model call fails: keeps the newest text within the limit. */
export function extractiveSummary(previous: string, batch: Array<{ role: string; content: string }>): string {
  const added = batch.filter((m) => !isDeletedMessage(m)).map((m) => truncateTokens(messageContent(m.content), 30)).join(' ');
  return truncateTokens(`${previous} ${added}`, SUMMARY_TOKEN_LIMIT, true);
}
