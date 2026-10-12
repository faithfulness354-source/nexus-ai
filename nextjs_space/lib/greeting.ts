import { prisma } from '@/lib/db';
import { composeOpening, type OpeningCharacter } from '@/lib/opening';

export { composeOpening } from '@/lib/opening';

/** The card's saved first message, with names filled in. */
export function characterGreeting(character: OpeningCharacter, userName: string): string {
  return composeOpening(character, userName);
}

/** Writes the greeting once when a chat has no messages yet. */
export async function ensureGreeting(
  sessionId: string,
  character: OpeningCharacter,
  personaId?: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.message.count({ where: { sessionId } });
    if (count > 0) return null;
    let userName = 'You';
    if (personaId) {
      const persona = await tx.persona.findFirst({ where: { id: personaId }, select: { name: true } });
      if (persona?.name?.trim()) userName = persona.name.trim();
    }
    const content = characterGreeting(character, userName);
    if (!content) return null;
    return tx.message.create({
      data: { sessionId, role: 'ASSISTANT', content, index: 0 },
    });
  });
}
