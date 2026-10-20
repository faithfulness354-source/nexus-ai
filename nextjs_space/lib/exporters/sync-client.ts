export type NovelSyncKind = 'character' | 'lorebook' | 'persona' | 'scenario' | 'session';

/** Queues a NovelAI backup after a save. Failures stay off the UI and never block chat. */
export function queueNovelAiSync(kind: NovelSyncKind, id?: string | null): void {
  if (!id) return;
  try {
    void fetch('/api/sync/novelai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* A backup failure must not undo the save the user already finished. */
  }
}
