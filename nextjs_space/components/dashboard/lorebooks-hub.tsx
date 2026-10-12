'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, BookOpen, Trash2, Loader2, Save, ChevronDown, ChevronLeft, Lock, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AutoTextarea } from '@/components/editor/auto-textarea';
import { CharacterPicker } from './character-picker';
import { useAccess } from '@/components/billing/access-provider';
import { selectLore, LORE_TOKEN_BUDGET, type LoreEntryData } from '@/lib/hubs';
import { estimateTokens } from '@/lib/tokens';
import { cn } from '@/lib/utils';

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
const newEntry = (order: number): Book['entries'][number] => ({ _key: key(), title: '', keys: [], content: '', order, priority: 50, depth: 4, enabled: true });
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
  useEffect(() => { void load(); }, []);

  const triggered = useMemo(() => {
    if (!draft || !testText.trim()) return [];
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
            <p className="text-sm text-muted-foreground">Entries are added to the prompt only when their keywords appear in recent messages.</p>
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

          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Entries ({draft.entries.length})</h3>
            <Button size="sm" variant="secondary" onClick={() => {
              const e = newEntry(Math.max(99, ...draft.entries.map((x) => x.order)) + 1);
              setDraft({ ...draft, entries: [...draft.entries, e] });
              setOpen(e._key);
            }}><Plus className="h-4 w-4 mr-1" /> Add entry</Button>
          </div>

          {draft.entries.map((e) => {
            const isOpen = open === e._key;
            return (
              <div key={e._key} className={cn('rounded-xl bg-card ring-1', e.enabled ? 'ring-white/5' : 'ring-white/5 opacity-60')}>
                <button type="button" onClick={() => setOpen(isOpen ? null : e._key)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{e.title || e.keys[0] || 'Untitled entry'}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{e.keys.length ? e.keys.join(', ') : 'No keywords — never triggers'} · P{e.priority} · depth {e.depth}</p>
                  </div>
                  <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><Label>Title</Label><Input value={e.title} maxLength={120} onChange={(ev) => setEntry(e._key, { title: ev.target.value })} placeholder="Kingdom of Eldoria" /></div>
                      <div>
                        <Label>Activation keywords</Label>
                        <Input defaultValue={e.keys.join(', ')} onBlur={(ev) => setEntry(e._key, { keys: ev.target.value.split(',').map((k) => k.trim()).filter(Boolean) })} placeholder="Eldoria, the capital, King Aldric" />
                      </div>
                    </div>
                    <div>
                      <Label>Content</Label>
                      <AutoTextarea minHeight={90} value={e.content} onChange={(ev) => setEntry(e._key, { content: ev.target.value })} placeholder="What the AI should know when this comes up." />
                      <p className="mt-1 text-[11px] text-muted-foreground">≈ {estimateTokens(e.content)} tokens</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div><Label title="Lower numbers are inserted first">Insertion order</Label><Input type="number" value={e.order} onChange={(ev) => setEntry(e._key, { order: Number(ev.target.value) })} /></div>
                      <div><Label title="Higher priority entries survive when the budget is full">Priority (0–100)</Label><Input type="number" min={0} max={100} value={e.priority} onChange={(ev) => setEntry(e._key, { priority: Number(ev.target.value) })} /></div>
                      <div><Label title="How many recent messages are scanned">Scan depth</Label><Input type="number" min={1} max={50} value={e.depth} onChange={(ev) => setEntry(e._key, { depth: Number(ev.target.value) })} /></div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm"><Switch checked={e.enabled} onCheckedChange={(enabled) => setEntry(e._key, { enabled })} /> Enabled</label>
                      <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => setDraft({ ...draft, entries: draft.entries.filter((x) => x._key !== e._key) })}><Trash2 className="h-4 w-4 mr-1" /> Remove</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl bg-card p-4 ring-1 ring-white/5 lg:sticky lg:top-20">
            <p className="flex items-center gap-2 font-semibold text-sm"><FlaskConical className="h-4 w-4 text-primary" /> Activation tester</p>
            <p className="text-xs text-muted-foreground mt-1 mb-2">Type a sample message to see which entries would be injected (budget {LORE_TOKEN_BUDGET} tokens).</p>
            <AutoTextarea minHeight={80} value={testText} onChange={(e) => setTestText(e.target.value)} placeholder="We ride for Eldoria at dawn…" />
            <div className="mt-3 space-y-1.5">
              {testText.trim() && triggered.length === 0 && <p className="text-xs text-muted-foreground">No entries triggered.</p>}
              {triggered.map((e, i) => (
                <div key={i} className="rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs">
                  <span className="font-semibold text-primary">{e.title || e.keys[0]}</span>
                  <span className="text-muted-foreground"> · order {e.order} · P{e.priority}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
