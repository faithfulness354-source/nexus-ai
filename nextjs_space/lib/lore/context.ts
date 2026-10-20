import 'server-only';
import { prisma } from '@/lib/db';
import { unpackList } from '@/lib/hub-server';
import { formatLoreContext, selectLore, LORE_TOKEN_BUDGET, type LoreEntryData, type LorePlacement } from '@/lib/hubs';

function asPlacement(value: string): LorePlacement {
  return value === 'personality' || value === 'scenario' || value === 'example_dialogs' ? value : 'default';
}

/**
 * Activates one lorebook against recent chat lines and returns the prompt block.
 * Constant entries are always included. Other entries fire when a keyword hits
 * the last `scan_depth` messages. The result stays inside `tokenBudget`.
 */
export async function assembleLorebookContext(args: {
  lorebookId: string;
  chatHistory: string[];
  tokenBudget?: number;
  userId: string;
}): Promise<string> {
  const book = await prisma.lorebook.findFirst({
    where: { id: args.lorebookId, userId: args.userId, enabled: true },
    include: { entries: true },
  });
  if (!book) return '';
  const entries: LoreEntryData[] = book.entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    keys: unpackList(entry.keys),
    content: entry.content,
    order: entry.order,
    priority: entry.priority,
    depth: entry.depth,
    enabled: entry.enabled,
    placement: asPlacement(entry.placement),
    constant: entry.constant,
  }));
  return formatLoreContext(selectLore(entries, args.chatHistory, args.tokenBudget ?? LORE_TOKEN_BUDGET));
}
