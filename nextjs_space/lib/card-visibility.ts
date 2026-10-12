export const CARD_VISIBILITIES = ['PRIVATE', 'PUBLIC', 'UNLISTED'] as const;
export type CardVisibility = (typeof CARD_VISIBILITIES)[number];

export function parseVisibility(value: unknown): CardVisibility | null {
  const name = String(value ?? '').trim().toUpperCase();
  return (CARD_VISIBILITIES as readonly string[]).includes(name) ? (name as CardVisibility) : null;
}

/** Shown on the author's cards and in the admin directory. */
export function visibilityLabel(visibility: string | null | undefined, moderated?: boolean | null): string {
  if (moderated) return 'Disabled / Moderated';
  if (visibility === 'PUBLIC') return 'Published / Public';
  if (visibility === 'UNLISTED') return 'Unlisted';
  return 'Draft / Private';
}

export function visibilityBadgeClass(visibility: string | null | undefined, moderated?: boolean | null): string {
  if (moderated) return 'bg-rose-600 text-white';
  if (visibility === 'PUBLIC') return 'bg-emerald-600 text-white';
  if (visibility === 'UNLISTED') return 'bg-sky-600 text-white';
  return 'bg-amber-500 text-amber-950';
}

type CardAccess = { visibility?: string | null; moderated?: boolean | null; ownerId?: string | null };
type CardViewer = { isCreatorAdmin?: boolean; userId?: string | null } | null;

/** Browse and search only list cards the author published and that have not been taken down. */
export function isPubliclyListed(card: CardAccess): boolean {
  return card.visibility === 'PUBLIC' && !card.moderated;
}

/**
 * Private drafts are owner-only. Unlisted cards work from a direct link.
 * A moderated card is hidden from everyone except its owner and the creator admin.
 */
export function canViewCharacter(viewer: CardViewer, card: CardAccess): boolean {
  if (viewer?.isCreatorAdmin) return true;
  if (viewer?.userId && card.ownerId && card.ownerId === viewer.userId) return true;
  if (card.moderated) return false;
  return card.visibility === 'PUBLIC' || card.visibility === 'UNLISTED';
}
