import { prisma } from '@/lib/db';
import { cardFirstMessage, composeOpening, type OpeningCharacter } from '@/lib/opening';
import { stripPromptLeak } from '@/lib/prompt-leak';

export { composeOpening } from '@/lib/opening';

/** The card's saved first message, with names filled in. */
export function characterGreeting(character: OpeningCharacter, userName: string): string {
  return composeOpening(character, userName);
}

/** Writes the greeting once when a chat has no live messages yet. The text is read from the character row for this session, not from a previously loaded card. */
export async function ensureGreeting(
  sessionId: string,
  _character?: OpeningCharacter,
  personaId?: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.message.count({ where: { sessionId, deleted: false } });
    if (count > 0) return null;
    const session = await tx.chatSession.findUnique({
      where: { id: sessionId },
      select: {
        personaId: true,
        character: { select: { name: true, initialMessage: true } },
      },
    });
    const card = session?.character;
    if (!card) return null;
    const personaKey = personaId ?? session.personaId;
    let userName = 'You';
    if (personaKey) {
      const persona = await tx.persona.findFirst({ where: { id: personaKey }, select: { name: true } });
      if (persona?.name?.trim()) userName = persona.name.trim();
    }
    const firstMessage = cardFirstMessage({ initialMessage: card.initialMessage });
    const content = stripPromptLeak(characterGreeting({
      name: card.name,
      initialMessage: firstMessage,
      firstMessage,
    }, userName));
    if (!content) return null;
    const highest = await tx.message.aggregate({ where: { sessionId }, _max: { index: true } });
    return tx.message.create({
      data: { sessionId, role: 'ASSISTANT', content, index: (highest._max.index ?? -1) + 1 },
    });
  });
}
