import { prisma } from '@/lib/db';
import type { Persona } from '@prisma/client';
import { parseAppearance } from '@/lib/persona-appearance';
import { describeAvatar } from '@/lib/avatar-snapshot';
import { analyzePersonaImage } from '@/lib/vision/vlm';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** SQLite stores this column as text. Accept a list or a previously saved JSON list. */
export function boundIds(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.trim().startsWith('[')
      ? (() => { try { return JSON.parse(value); } catch { return []; } })()
      : [];
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))).slice(0, 100);
}

export function personaInput(body: any) {
  return {
    name: str(body?.name, 60).trim(),
    avatar: typeof body?.avatar === 'string' && body.avatar.trim() ? body.avatar.trim().slice(0, 1000) : null,
    pronouns: str(body?.pronouns, 40).trim() || 'They/Them',
    physical: str(body?.physical, 4000),
    attire: str(body?.attire, 4000),
    visualTraits: str(body?.visualTraits, 4000),
    appearance: JSON.stringify(parseAppearance(body?.appearance)),
    personality: str(body?.personality, 4000),
    backstory: str(body?.backstory, 6000),
    speech: str(body?.speech, 4000),
    isDefault: !!body?.isDefault,
    boundCharacterIds: JSON.stringify(boundIds(body?.boundCharacterIds)),
  };
}

type VisualPrevious = {
  avatarSnapshot?: string | null;
  avatarSnapshotFor?: string | null;
  visualDescription?: string | null;
  visualAnchor?: string | null;
  visualAnalyzedFor?: string | null;
};

/**
 * Keeps cached VLM visual fields when the avatar URL is unchanged.
 * On avatar change, runs OpenRouter VLM analysis (with timeout safety) and
 * falls back to the legacy short Gemini snapshot when VLM returns empty.
 */
export async function withAvatarSnapshot<T extends { avatar: string | null }>(
  data: T,
  previous?: VisualPrevious,
) {
  if (!data.avatar) {
    return {
      ...data,
      avatarSnapshot: '',
      avatarSnapshotFor: '',
      visualDescription: null as string | null,
      visualAnchor: null as string | null,
      visualAnalyzedFor: '',
    };
  }

  const sameAvatar = previous?.visualAnalyzedFor === data.avatar
    || previous?.avatarSnapshotFor === data.avatar;
  if (
    sameAvatar
    && (previous?.visualDescription || previous?.visualAnchor || previous?.avatarSnapshot)
  ) {
    return {
      ...data,
      avatarSnapshot: previous?.avatarSnapshot || previous?.visualAnchor || '',
      avatarSnapshotFor: data.avatar,
      visualDescription: previous?.visualDescription ?? null,
      visualAnchor: previous?.visualAnchor ?? null,
      visualAnalyzedFor: previous?.visualAnalyzedFor || data.avatar,
    };
  }

  const analysis = await analyzePersonaImage(data.avatar);
  let avatarSnapshot = analysis.visualAnchor || analysis.visualDescription;
  if (!avatarSnapshot) {
    // Soft fallback: short legacy snapshot if OpenRouter VLM is unavailable/timed out.
    avatarSnapshot = await describeAvatar(data.avatar);
  }

  return {
    ...data,
    avatarSnapshot: avatarSnapshot || '',
    avatarSnapshotFor: avatarSnapshot ? data.avatar : '',
    visualDescription: analysis.visualDescription || null,
    visualAnchor: analysis.visualAnchor || (avatarSnapshot ? avatarSnapshot.slice(0, 120) : null),
    visualAnalyzedFor: (analysis.visualDescription || analysis.visualAnchor || avatarSnapshot) ? data.avatar : '',
  };
}

export function personaDto<T extends { appearance?: string | null; boundCharacterIds?: string | null }>(row: T) {
  return { ...row, appearance: parseAppearance(row.appearance), boundCharacterIds: boundIds(row.boundCharacterIds) };
}

/** Keeps one global default and makes each character bound to at most one persona. */
export async function normalizePersonaBindings(userId: string, persona: Persona) {
  if (persona.isDefault) {
    await prisma.persona.updateMany({ where: { userId, id: { not: persona.id }, isDefault: true }, data: { isDefault: false } });
  }
  const mine = boundIds(persona.boundCharacterIds);
  if (!mine.length) return;
  const others = await prisma.persona.findMany({ where: { userId, id: { not: persona.id } } });
  for (const other of others) {
    const next = boundIds(other.boundCharacterIds).filter((id) => !mine.includes(id));
    if (next.length === boundIds(other.boundCharacterIds).length) continue;
    await prisma.persona.update({ where: { id: other.id }, data: { boundCharacterIds: JSON.stringify(next) } });
  }
}
