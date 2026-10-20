import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ensureCloudUser } from '@/lib/supabase/identity';
import type { ImportedLoreEntry } from '@/lib/lore/import';

/** Copies a batch of imported entries into the public lorebook tables. Failures stay in the app database. */
export async function mirrorLoreImport(owner: { id: string; email: string }, book: { id: string; name: string; description: string }, entries: Array<ImportedLoreEntry & { localId: string }>): Promise<void> {
  const admin = supabaseAdmin();
  if (!admin || !entries.length) return;
  const userId = await ensureCloudUser(owner.email, owner.id);
  if (!userId) return;
  await admin.from('profiles').upsert({ id: userId }, { onConflict: 'id' });
  const savedBook = await admin.from('lorebooks').upsert({
    local_id: book.id,
    user_id: userId,
    name: book.name || 'Lorebook',
    description: book.description || '',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'local_id' }).select('id').single();
  if (savedBook.error || !savedBook.data?.id) {
    console.error('[supabase] lorebook upsert failed', savedBook.error?.message ?? 'missing id');
    return;
  }
  const inserted = await admin.from('lorebook_entries').insert(entries.map((entry) => ({
    lorebook_id: savedBook.data.id,
    local_id: entry.localId,
    title: entry.title,
    keywords: entry.keywords,
    content: entry.content,
    insertion_order: entry.insertion_order,
    priority: entry.priority,
    scan_depth: entry.scan_depth,
    placement: entry.placement,
    enabled: entry.enabled,
    constant: entry.constant,
  })));
  if (inserted.error) console.error('[supabase] lorebook entry insert failed', inserted.error.message);
}
