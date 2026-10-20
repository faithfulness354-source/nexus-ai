'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, BookOpen, Trash2, Loader2, Save, ChevronLeft, Lock, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { queueNovelAiSync } from '@/lib/exporters/sync-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AutoTextarea } from '@/components/editor/auto-textarea';
import { CharacterPicker } from './character-picker';
import { useAccess } from '@/components/billing/access-provider';
import { selectLore, formatLoreContext, LORE_TOKEN_BUDGET, type LoreEntryData, type LorePlacement } from '@/lib/hubs';
import { LoreImportButton } from './lore-import';
import { estimateTokens } from '@/lib/tokens';
import { cn } from '@/lib/utils';

function keywordList(raw: string): string[] {
  const parts = raw.split(',').map((item) => item.trim());
  if (raw.trimEnd().endsWith(',')) return parts.filter((item, index) => item.length > 0 || index === parts.length - 1);
  return parts.filter(Boolean);
}

interface Book {
  id?: string;
  name: string;
  description: string;
  scope: 'GLOBAL' | 'CHARACTER' | 'PERSONA';
  characterIds: string[];
  personaIds: string[];
  enabled: boolean;
  entries: (LoreEntryData & { _key: string })[];
}

const key = () => Math.random().toString(36).slice(2);
const PLACEMENTS: { value: LorePlacement; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'personality', label: 'Personality' },
  { value: 'scenario', label: 'Scenario' },
  { value: 'example_dialogs', label: 'Example dialogs' },
];
const newEntry = (order: number): Book['entries'][number] => ({
  _key: key(), title: '', keys: [], content: '', order, priority: 50, depth: 4, enabled: true, placement: 'default', constant: false,
});
const SCOPE_LABEL = { GLOBAL: 'Global (all chats)', CHARACTER: 'Specific characters', PERSONA: 'Specific personas' };

export function LorebooksHub() {
  const { status } = useAccess();
  const entitled = !!status?.can.customPrompts;
  const [books, setBooks] = useState<Book[]>([]);
  const [personas, setPersonas] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Book | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testText, setTestText] = useState('');

  async function load() {
    try {
      const [b, p] = await Promise.all([fetch('/api/lorebooks').then((r) => r.json()), fetch('/api/personas').then((r) => r.json())]);
      setBooks(Array.isArray(b) ? b.map((x: any) => ({ ...x, entries: x.entries.map((e: any) => ({ ...e, _key: e.id })) })) : []);
      setPersonas(Array.isArray(p) ? p : []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load lorebooks');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void (async () => { await load(); })();
  }, []);

  const triggered = useMemo(() => {
    if (!draft) return [];
    return selectLore(draft.entries, [testText]);
  }, [draft, testText]);

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) return toast.error('Lorebook name is required');
    setSaving(true);
    try {
      const r = await fetch(draft.id ? `/api/lorebooks/${draft.id}` : '/api/lorebooks', {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, entries: draft.entries.map(({ _key, id, ...e }) => e) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? 'Failed to save');
      toast.success('Lorebook saved');
      queueNovelAiSync('lorebook', d.id);
      setDraft({ ...d, entries: d.entries.map((e: any) => ({ ...e, _key: e.id })) });
      void load();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function remove(b: Book) {
    if (!b.id || !confirm(`Delete lorebook "${b.name}" and all its entries?`)) return;
    const r = await fetch(`/api/lorebooks/${b.id}`, { method: 'DELETE' });
    if (!r.ok) return toast.error('Failed to delete');
    toast.success('Lorebook deleted');
    setDraft(null);
    void load();
  }

  const setEntry = (k: string, patch: Partial<LoreEntryData>) =>
    draft && setDraft({ ...draft, entries: draft.entries.map((e) => (e._key === k ? { ...e, ...patch } : e)) });

  const lockNotice = !entitled && (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200 ring-1 ring-amber-500/20">
      <Lock className="h-4 w-4 shrink-0" />
      <span className="flex-1">Lorebook creation and editing unlock with the Plus plan. Existing lorebooks stay saved but are not used in chats.</span>
      <Link href="/settings?tab=subscription" className="font-semibold underline underline-offset-2">Upgrade</Link>
    </div>
  );

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  if (!draft) {
    return (
      <section>
        {lockNotice}
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <h2 className="font-display text-xl font-bold">Lorebooks</h2>
            <p className="text-sm text-muted-foreground">Entries join the prompt when a keyword appears in recent messages, or when the entry is always active.</p>
          </div>
          <Button disabled={!entitled} onClick={() => { setDraft({ name: '', description: '', scope: 'GLOBAL', characterIds: [], personaIds: [], enabled: true, entries: [newEntry(100)] }); setOpen(null); }}>
            {entitled ? <Plus className="h-4 w-4 mr-1" /> : <Lock className="h-4 w-4 mr-1" />} New lorebook
          </Button>
        </div>
        {books.length === 0 ? (
          <div className="rounded-2xl bg-card p-10 text-center ring-1 ring-white/5">
            <BookOpen className="h-10 w-10 mx-auto text-primary mb-3" />
            <p className="font-semibold">No lorebooks yet</p>
            <p className="text-sm text-muted-foreground mt-1">Document kingdoms, factions, spells and secrets for your worlds.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((b) => (
              <button key={b.id} type="button" onClick={() => { setDraft(b); setOpen(null); }} className="text-left rounded-2xl bg-card p-4 ring-1 ring-white/5 hover:ring-primary/40 transition shadow-lg shadow-black/20">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold truncate">{b.name}</p>
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', b.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-secondary text-muted-foreground')}>{b.enabled ? 'Active' : 'Off'}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{b.description || 'No description.'}</p>
                <p className="mt-3 text-[11px] text-muted-foreground">{b.entries.length} entries · {SCOPE_LABEL[b.scope]}</p>
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section>
      {lockNotice}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
        <Button variant="ghost" onClick={() => setDraft(null)}><ChevronLeft className="h-4 w-4 mr-1" /> All lorebooks</Button>
        <div className="flex gap-2">
          {draft.id && <Button variant="ghost" className="hover:text-destructive" onClick={() => remove(draft)}><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>}
          <Button onClick={save} disabled={saving || !entitled}>{saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Save lorebook</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4 min-w-0">
          <div className="rounded-2xl bg-card p-5 ring-1 ring-white/5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="lb-name">Name</Label>
                <Input id="lb-name" value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="The Shattered Realms" />
              </div>
              <div>
                <Label>Applies to</Label>
                <Select value={draft.scope} onValueChange={(scope: Book['scope']) => setDraft({ ...draft, scope })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(SCOPE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <AutoTextarea minHeight={60} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="What this lorebook covers (not sent to the AI)." />
            </div>
            {draft.scope === 'CHARACTER' && <CharacterPicker value={draft.characterIds} onChange={(characterIds) => setDraft({ ...draft, characterIds })} max={200} />}
            {draft.scope === 'PERSONA' && (
              <div className="flex flex-wrap gap-1.5">
                {personas.length === 0 && <p className="text-xs text-muted-foreground">Create a persona first.</p>}
                {personas.map((p) => {
                  const on = draft.personaIds.includes(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => setDraft({ ...draft, personaIds: on ? draft.personaIds.filter((x) => x !== p.id) : [...draft.personaIds, p.id] })}
                      className={cn('rounded-full px-3 py-1 text-xs ring-1 transition', on ? 'bg-primary text-primary-foreground ring-primary' : 'ring-white/10 hover:ring-primary/50')}>{p.name}</button>
                  );
                })}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} />
              <span className="text-sm">Lorebook enabled</span>
            </div>
          </div>

          {(() => {
            const selected = draft.entries.find((entry) => entry._key === open) ?? draft.entries[0] ?? null;
            const activeKeys = new Set(triggered.map((entry) => entry.id ?? entry.title + entry.keys.join('|')));
            return (
              <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                <div className="rounded-2xl bg-card ring-1 ring-white/5 min-h-0">
                  <div className="flex items-center justify-between gap-2 px-3 py-3 border-b border-white/5">
                    <h3 className="font-semibold text-sm">Entries ({draft.entries.length})</h3>
                    <div className="flex gap-1">
                      <LoreImportButton lorebookId={draft.id} disabled={!entitled} onImported={(entries) => {
                        setDraft((current) => current && ({
                          ...current,
                          entries: [...current.entries, ...entries.map((entry) => ({
                            id: entry.id,
                            title: entry.title ?? '',
                            keys: Array.isArray(entry.keys) ? entry.keys : [],
                            content: entry.content ?? '',
                            order: entry.order ?? 100,
                            priority: entry.priority ?? 50,
                            depth: entry.depth ?? 4,
                            enabled: entry.enabled !== false,
                            placement: entry.placement,
                            constant: entry.constant === true,
                            _key: entry.id,
                          }))],
                        }));
                        void load();
                      }} />
                      <Button size="sm" variant="secondary" onClick={() => {
                        const entry = newEntry(Math.max(99, ...draft.entries.map((item) => item.order)) + 1);
                        setDraft({ ...draft, entries: [...draft.entries, entry] });
                        setOpen(entry._key);
                      }}><Plus className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <div className="max-h-[640px] overflow-y-auto p-2 space-y-1">
                    {draft.entries.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">No entries yet.</p>}
                    {draft.entries.map((entry) => {
                      const hit = testText.trim() && activeKeys.has(entry.id ?? entry.title + entry.keys.join('|'));
                      const current = selected?._key === entry._key;
                      return (
                        <div key={entry._key} className={cn('flex items-center gap-2 rounded-lg px-2 py-2', current ? 'bg-primary/15' : 'hover:bg-white/5', hit && 'ring-1 ring-primary/50')}>
                          <button type="button" onClick={() => setOpen(entry._key)} className="min-w-0 flex-1 text-left">
                            <p className="text-sm font-medium truncate">{entry.title || entry.keys[0] || 'Untitled entry'}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{entry.constant ? 'Always on' : entry.keys.join(', ') || 'No keywords'} · P{entry.priority}</p>
                          </button>
                          <Switch checked={entry.enabled} onCheckedChange={(enabled) => setEntry(entry._key, { enabled })} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {selected ? (
                  <div className="rounded-2xl bg-card p-4 ring-1 ring-white/5 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><Label>Title</Label><Input value={selected.title} maxLength={120} onChange={(event) => setEntry(selected._key, { title: event.target.value })} placeholder="Kingdom of Eldoria" /></div>
                      <div>
                        <Label>Activation keywords</Label>
                        <Input
                          value={selected.keys.join(', ')}
                          onChange={(event) => setEntry(selected._key, { keys: keywordList(event.target.value) })}
                          placeholder="Eldoria, the capital, /king\s+aldric/i"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Content</Label>
                      <AutoTextarea minHeight={140} value={selected.content} onChange={(event) => setEntry(selected._key, { content: event.target.value })} placeholder="What the AI should know when this entry activates." />
                      <p className="mt-1 text-[11px] text-muted-foreground">≈ {estimateTokens(selected.content)} tokens</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label>Insertion order</Label>
                        <Input type="number" value={selected.order} onChange={(event) => setEntry(selected._key, { order: Number(event.target.value) })} />
                      </div>
                      <div>
                        <Label>Scan depth</Label>
                        <Input type="number" min={1} max={50} value={selected.depth} onChange={(event) => setEntry(selected._key, { depth: Number(event.target.value) })} />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between"><Label>Priority</Label><span className="text-xs text-muted-foreground">{selected.priority}</span></div>
                      <input type="range" min={0} max={100} value={selected.priority} onChange={(event) => setEntry(selected._key, { priority: Number(event.target.value) })} className="w-full accent-primary" />
                    </div>
                    <div>
                      <Label>Placement</Label>
                      <Select value={selected.placement ?? 'default'} onValueChange={(placement: LorePlacement) => setEntry(selected._key, { placement })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{PLACEMENTS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-sm"><Switch checked={selected.constant === true} onCheckedChange={(constant) => setEntry(selected._key, { constant })} /> Always active</label>
                      <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => {
                        const next = draft.entries.filter((entry) => entry._key !== selected._key);
                        setDraft({ ...draft, entries: next });
                        setOpen(next[0]?._key ?? null);
                      }}><Trash2 className="h-4 w-4 mr-1" /> Remove</Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground ring-1 ring-white/5">Add an entry or import a world info file.</div>
                )}
              </div>
            );
          })()}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl bg-card p-4 ring-1 ring-white/5 lg:sticky lg:top-20">
            <p className="flex items-center gap-2 font-semibold text-sm"><FlaskConical className="h-4 w-4 text-primary" /> Activation tester</p>
            <p className="text-xs text-muted-foreground mt-1 mb-2">Type a sample turn. Constant entries and keyword hits are listed within the {LORE_TOKEN_BUDGET}-token budget.</p>
            <AutoTextarea minHeight={80} value={testText} onChange={(event) => setTestText(event.target.value)} placeholder="We ride for Eldoria at dawn…" />
            <p className="mt-2 text-[11px] text-muted-foreground">{triggered.reduce((sum, entry) => sum + estimateTokens(entry.content), 0)} / {LORE_TOKEN_BUDGET} tokens</p>
            <div className="mt-3 space-y-1.5">
              {testText.trim() && triggered.length === 0 && <p className="text-xs text-muted-foreground">No entries triggered.</p>}
              {triggered.map((entry, index) => (
                <div key={entry.id ?? index} className="rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs">
                  <span className="font-semibold text-primary">{entry.title || entry.keys[0] || 'Untitled'}</span>
                  <span className="text-muted-foreground"> · {entry.constant ? 'constant' : 'keyword'} · P{entry.priority} · ≈ {estimateTokens(entry.content)}</span>
                </div>
              ))}
            </div>
            {triggered.length > 0 && (
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-[11px] text-foreground/80">{formatLoreContext(triggered)}</pre>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
