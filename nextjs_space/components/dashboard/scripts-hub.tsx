'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Code2, Pencil, Trash2, Loader2, Lock, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AutoTextarea } from '@/components/editor/auto-textarea';
import { useAccess } from '@/components/billing/access-provider';
import { PLACEMENT_LABELS, applyScripts, compileScript, type ScriptData, type ScriptPlacement } from '@/lib/hubs';
import { cn } from '@/lib/utils';

type Draft = Omit<ScriptData, 'id'> & { id?: string };
const EMPTY: Draft = { name: '', kind: 'REGEX', findPattern: '', flags: 'g', replaceWith: '', placement: 'DISPLAY', promptText: '', enabled: true, order: 100 };

const PRESETS: { label: string; draft: Partial<Draft> }[] = [
  { label: 'Strip OOC notes', draft: { name: 'Strip OOC notes', findPattern: '\\(\\(?OOC:[^)]*\\)\\)?', flags: 'gi', replaceWith: '', placement: 'POST' } },
  { label: 'Curly quotes → straight', draft: { name: 'Straight quotes', findPattern: '[“”]', flags: 'g', replaceWith: '"', placement: 'DISPLAY' } },
  { label: 'Collapse blank lines', draft: { name: 'Collapse blank lines', findPattern: '\\n{3,}', flags: 'g', replaceWith: '\\n\\n', placement: 'POST' } },
];

export function ScriptsHub() {
  const { status, openPaywall } = useAccess();
  const canPrompt = !!status?.can.customPrompts;
  const [scripts, setScripts] = useState<ScriptData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [sample, setSample] = useState('*She smiles.* “Welcome back, traveler.” (OOC: nice scene)');

  async function load() {
    try {
      const r = await fetch('/api/scripts');
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? 'Failed to load scripts');
      setScripts(d);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? 'Failed to load scripts');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void (async () => { await load(); })();
  }, []);

  const regexError = editing?.kind === 'REGEX' && editing.findPattern ? (() => { const r = compileScript(editing.findPattern, editing.flags); return typeof r === 'string' ? r : null; })() : null;
  const preview = useMemo(() => {
    if (!editing || editing.kind !== 'REGEX' || regexError || !editing.findPattern) return sample;
    return applyScripts(sample, [{ ...editing, enabled: true }], editing.placement);
  }, [editing, sample, regexError]);

  async function put(s: Draft) {
    const r = await fetch(s.id ? `/api/scripts/${s.id}` : '/api/scripts', {
      method: s.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error ?? 'Failed to save script');
  }

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) return toast.error('Name is required');
    if (editing.kind === 'PROMPT' && !canPrompt) { openPaywall('customPrompts'); return; }
    if (regexError) return toast.error(`Invalid pattern: ${regexError}`);
    setSaving(true);
    try {
      await put(editing);
      toast.success('Script saved');
      setEditing(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(s: ScriptData) {
    setScripts((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled: !s.enabled } : x)));
    try { await put({ ...s, enabled: !s.enabled }); } catch (err: any) { toast.error(err?.message); void load(); }
  }

  async function remove(s: ScriptData) {
    if (!confirm(`Delete script "${s.name}"?`)) return;
    const r = await fetch(`/api/scripts/${s.id}`, { method: 'DELETE' });
    if (!r.ok) return toast.error('Failed to delete');
    toast.success('Script deleted');
    void load();
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h2 className="font-display text-xl font-bold">Custom Scripts</h2>
          <p className="text-sm text-muted-foreground">Regex find-and-replace on messages, or extra instructions added to every chat prompt.</p>
        </div>
        <Button onClick={() => setEditing({ ...EMPTY })}><Plus className="h-4 w-4 mr-1" /> New script</Button>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : scripts.length === 0 ? (
        <div className="rounded-2xl bg-card p-10 text-center ring-1 ring-white/5">
          <Code2 className="h-10 w-10 mx-auto text-primary mb-3" />
          <p className="font-semibold">No scripts yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Start from a preset:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {PRESETS.map((p) => <Button key={p.label} size="sm" variant="secondary" onClick={() => setEditing({ ...EMPTY, ...p.draft })}><Wand2 className="h-3.5 w-3.5 mr-1" />{p.label}</Button>)}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {scripts.map((s) => (
            <div key={s.id} className={cn('flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-white/5', !s.enabled && 'opacity-60')}>
              <Switch checked={s.enabled} onCheckedChange={() => toggle(s)} aria-label={`Toggle ${s.name}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{s.name}</p>
                <p className="text-[11px] text-muted-foreground truncate font-mono">
                  {s.kind === 'PROMPT' ? `Prompt · ${s.promptText.slice(0, 80)}` : `/${s.findPattern}/${s.flags} → ${s.replaceWith || '∅'}`}
                </p>
              </div>
              <span className="hidden sm:inline rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{s.kind === 'PROMPT' ? 'PROMPT' : s.placement}</span>
              {s.kind === 'PROMPT' && !canPrompt && <Lock className="h-3.5 w-3.5 text-amber-300" aria-label="Requires Plus" />}
              <Button size="icon" variant="ghost" aria-label="Edit script" onClick={() => setEditing({ ...s })}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" aria-label="Delete script" className="hover:text-destructive" onClick={() => remove(s)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? 'Edit script' : 'New script'}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                <div><Label htmlFor="s-name">Name</Label><Input id="s-name" value={editing.name} maxLength={80} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                <div>
                  <Label>Type</Label>
                  <Select value={editing.kind} onValueChange={(kind: Draft['kind']) => {
                    if (kind === 'PROMPT' && !canPrompt) { openPaywall('customPrompts'); return; }
                    setEditing({ ...editing, kind });
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="REGEX">Regex replace</SelectItem><SelectItem value="PROMPT">Prompt injection</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>

              {editing.kind === 'REGEX' ? (
                <>
                  <div>
                    <Label>Runs</Label>
                    <Select value={editing.placement} onValueChange={(placement: ScriptPlacement) => setEditing({ ...editing, placement })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{(Object.keys(PLACEMENT_LABELS) as ScriptPlacement[]).map((p) => <SelectItem key={p} value={p}>{PLACEMENT_LABELS[p]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
                    <div>
                      <Label>Find (regular expression)</Label>
                      <Input className={cn('font-mono', regexError && 'ring-1 ring-destructive')} value={editing.findPattern} maxLength={500} onChange={(e) => setEditing({ ...editing, findPattern: e.target.value })} placeholder="\(OOC:[^)]*\)" />
                    </div>
                    <div><Label>Flags</Label><Input className="font-mono" value={editing.flags} maxLength={6} onChange={(e) => setEditing({ ...editing, flags: e.target.value })} placeholder="gi" /></div>
                  </div>
                  {regexError && <p className="text-xs text-destructive -mt-2">{regexError}</p>}
                  <div>
                    <Label>Replace with</Label>
                    <Input className="font-mono" value={editing.replaceWith} maxLength={2000} onChange={(e) => setEditing({ ...editing, replaceWith: e.target.value })} placeholder="$1 — use \n for new lines, leave empty to delete" />
                  </div>
                  <div className="rounded-xl bg-background/60 p-3 ring-1 ring-white/5 space-y-2">
                    <Label>Live test</Label>
                    <AutoTextarea minHeight={60} value={sample} onChange={(e) => setSample(e.target.value)} />
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Result</p>
                    <p className="whitespace-pre-wrap rounded-lg bg-secondary px-3 py-2 text-sm">{preview || <span className="text-muted-foreground">(empty)</span>}</p>
                  </div>
                </>
              ) : (
                <div>
                  {!canPrompt && <p className="mb-2 text-xs text-amber-300">Prompt scripts are applied in chats on Plus and above.</p>}
                  <Label>Instruction added to the system prompt</Label>
                  <AutoTextarea minHeight={120} value={editing.promptText} maxLength={8000} onChange={(e) => setEditing({ ...editing, promptText: e.target.value })} placeholder="Always write {{char}}'s inner thoughts in italics. Never decide {{user}}'s actions." />
                  <p className="mt-1 text-[11px] text-muted-foreground">Macros: {'{{char}}'} and {'{{user}}'}.</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm"><Switch checked={editing.enabled} onCheckedChange={(enabled) => setEditing({ ...editing, enabled })} /> Enabled</label>
                <label className="flex items-center gap-2 text-sm">Run order <Input type="number" className="h-8 w-20" value={editing.order} onChange={(e) => setEditing({ ...editing, order: Number(e.target.value) })} /></label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !!regexError}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save script</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {!canPrompt && scripts.some((s) => s.kind === 'PROMPT') && (
        <p className="mt-4 text-xs text-muted-foreground">Locked prompt scripts need <Link href="/settings?tab=subscription" className="text-primary underline">Plus or higher</Link>. Regex scripts work on every plan.</p>
      )}
    </section>
  );
}
