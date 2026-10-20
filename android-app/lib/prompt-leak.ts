/** Instruction text that must stay in the system payload and never appear as a chat turn. */
const LEAK_START = /\[PRIMARY SYSTEM DIRECTIVE|TIER [123]:|\[CHARACTER DEFINITION\]|\[USER PERSONA\]|\[SYSTEM_PROGRESSION_ENGINE\]/i;

const LEAK_LINE = /^(?:\[PRIMARY SYSTEM DIRECTIVE[^\n]*|TIER [123]:.*|\[CHARACTER DEFINITION\]|\[USER PERSONA\]|\[LORE\]|\[CONTINUITY\].*|\[AUTONOMY\].*|\[LENGTH\].*|\[SYSTEM_PROGRESSION_ENGINE\].*|You are .+Roleplay with .+\.?|Summary:|Personality:|Character directives:|Scenario:|Rules:|Write rich, multi-paragraph roleplay responses\.?|Write detailed, multi-paragraph responses focusing on actions, environment, and dialogue\.?|Opening line already shown.*|Story so far \(canon\):.*|World lore \(relevant entries\):.*|Scene illustrations:.*|Reply length:.*|Status screen:.*|Persona update:.*|\d+\.\s+(?:You |A user|If the |IF |NEVER|Creator|When |Address |Explicitly|Firmly).*|[a-c]\.\s+.*)$/i;

const LEAK_FRAGMENT = /^\[?(?:PRIMARY|TIER\s*[123]|CHARACTER DEFINITION|USER PERSONA|SYSTEM_PROGRESSION)/i;

/** True when this text contains developer, tier, or character-definition instructions. */
export function containsPromptLeak(text: string): boolean {
  return LEAK_START.test(text);
}

/**
 * Removes a dumped system prompt from a user or assistant turn.
 * Text with no instruction markers is returned unchanged.
 */
export function stripPromptLeak(text: string): string {
  if (!text || !containsPromptLeak(text)) return text;
  const kept: string[] = [];
  let skipping = false;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (LEAK_START.test(trimmed) || (skipping && (trimmed === '' || LEAK_LINE.test(trimmed)))) {
      skipping = true;
      continue;
    }
    skipping = false;
    kept.push(line);
  }
  return kept.join('\n').replace(/^\s*(?:Character|User):\s*/i, '').trim();
}

/** Chat-bubble text. Hides a partial instruction header before the full block can be removed. */
export function visibleChatText(text: string): string {
  const stripped = stripPromptLeak(text);
  if (stripped !== text) return stripped;
  if (LEAK_FRAGMENT.test(text.trimStart().slice(0, 80))) return '';
  return text;
}
