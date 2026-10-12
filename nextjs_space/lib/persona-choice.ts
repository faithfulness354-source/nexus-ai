const LAST_PERSONA_KEY = 'nexus.lastPersonaId';

export function readLastPersonaId(): string | null {
  if (typeof window === 'undefined') return null;
  const value = localStorage.getItem(LAST_PERSONA_KEY)?.trim();
  return value || null;
}

export function writeLastPersonaId(id: string | null) {
  if (typeof window === 'undefined' || !id) return;
  localStorage.setItem(LAST_PERSONA_KEY, id);
}

/** Bound persona for this character, then the last persona the user chose, then their default. */
export function suggestPersonaId<T extends { id: string; isDefault: boolean; boundCharacterIds: string[] }>(
  personas: T[],
  characterId: string,
  lastUsedId?: string | null,
): string | null {
  const bound = personas.find((persona) => persona.boundCharacterIds.includes(characterId));
  if (bound) return bound.id;
  if (lastUsedId && personas.some((persona) => persona.id === lastUsedId)) return lastUsedId;
  return personas.find((persona) => persona.isDefault)?.id ?? personas[0]?.id ?? null;
}
