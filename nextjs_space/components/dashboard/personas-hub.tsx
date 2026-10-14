'use client';

import { useEffect, useState } from 'react';
import { Plus, Copy, Pencil, Trash2, Star, Link2, Loader2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AutoTextarea } from '@/components/editor/auto-textarea';
import { CharacterAvatar } from '@/components/character/character-avatar';
import { ImageField } from './image-field';
import { CharacterPicker } from './character-picker';
import { PRONOUN_OPTIONS, PERSONA_TOKEN_BUDGET, personaTokens, type PersonaData } from '@/lib/hubs';
import { APPEARANCE_GROUPS, emptyAppearance, parseAppearance, VISUAL_TOKEN_CAP, compilePerceivedAppearance } from '@/lib/persona-appearance';
import { estimateTokens } from '@/lib/tokens';
import { cn } from '@/lib/utils';

const EMPTY: Omit<PersonaData, 'id'> = {
  name: '', avatar: null, pronouns: 'They/Them', physical: '', attire: '', visualTraits: '',
  appearance: emptyAppearance(),
  personality: '', backstory: '', speech: '', isDefault: false, boundCharacterIds: [],
};

const FIELDS: { key: keyof PersonaData; label: string; hint: string }[] = [
  { key: 'physical', label: 'Extra physical notes', hint: 'Used when the face and body fields above are empty.' },
  { key: 'visualTraits', label: 'Extra body notes', hint: 'Used when the body fields above are empty.' },
  { key: 'attire', label: 'Extra outfit notes', hint: 'Used when the outfit fields above are empty.' },
  { key: 'personality', label: 'Personality', hint: 'Temperament, quirks, values.' },
  { key: 'backstory', label: 'Backstory', hint: 'Where you come from and what drives you.' },
  { key: 'speech', label: 'Speech patterns', hint: 'Accent, vocabulary, verbal tics.' },
];

export function PersonasHub() {
  const [personas, setPersonas] = useState<PersonaData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<(Omit<PersonaData, 'id'> & { id?: string }) | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const r = await fetch('/api/personas', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? 'Failed to load personas');
      setPersonas(d);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? 'Failed to load personas');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  useEffect(() => {
    function onRevision() {
      if (editing || saving) return;
      void load();
    }
    window.addEventListener('nexus:cloud-revision', onRevision);
    return () => window.removeEventListener('nexus:cloud-revision', onRevision);
  }, [editing, saving]);

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) return toast.error('Display name is required');
    setSaving(true);
    try {
      const r = await fetch(editing.id ? `/api/personas/${editing.id}` : '/api/personas', {
        method: editing.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? 'Failed to save persona');
      toast.success('Persona saved');
      setEditing(null);
      await load();
      window.dispatchEvent(new Event('nexus:cloud-revision'));
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save persona');
    } finally {
      setSaving(false);
    }
  }

  async function action(fn: () => Promise<Response>, ok: string) {
    try {
      const r = await fn();
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? 'Action failed');
      toast.success(ok);
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? 'Action failed');
    }
  }

  const clone = (p: PersonaData) => action(() => fetch('/api/personas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cloneFrom: p.id }) }), 'Persona cloned');
  const makeDefault = (p: PersonaData) => action(() => fetch(`/api/personas/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...p, isDefault: true }) }), `${p.name} is now your default`);
  const remove = (p: PersonaData) => {
    if (!confirm(`Delete persona "${p.name}"?`)) return;
    void action(() => fetch(`/api/personas/${p.id}`, { method: 'DELETE' }), 'Persona deleted');
  };

  const tokens = editing ? personaTokens(editing) : 0;
  const visualTokens = editing ? estimateTokens(compilePerceivedAppearance(editing)) : 0;
  const appearance = editing ? parseAppearance(editing.appearance) : emptyAppearance();
  const pronounPreset = editing ? (PRONOUN_OPTIONS as readonly string[]).includes(editing.pronouns) : true;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h2 className="font-display text-xl font-bold">Persona Manager</h2>
          <p className="text-sm text-muted-foreground">Characters see your active persona as <code className="text-primary">{'{{user}}'}</code>. Bind personas to characters or pick one per chat.</p>
        </div>
        <Button onClick={() => setEditing({ ...EMPTY })}><Plus className="h-4 w-4 mr-1" /> New persona</Button>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : personas.length === 0 ? (
        <div className="rounded-2xl bg-card p-10 text-center ring-1 ring-white/5">
          <UserRound className="h-10 w-10 mx-auto text-primary mb-3" />
          <p className="font-semibold">No personas yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Create who you want to be — a knight, a detective, yourself.</p>
          <Button onClick={() => setEditing({ ...EMPTY })}><Plus className="h-4 w-4 mr-1" /> Create your first persona</Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((p) => (
            <div key={p.id} className={cn('rounded-2xl bg-card p-4 ring-1 shadow-lg shadow-black/20 flex flex-col', p.isDefault ? 'ring-primary/50' : 'ring-white/5')}>
              <div className="flex items-center gap-3">
                <CharacterAvatar src={p.avatar} name={p.name} className="h-14 w-14 text-lg" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.pronouns}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.isDefault && <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary"><Star className="h-3 w-3" /> Default</span>}
                    {p.boundCharacterIds.length > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground"><Link2 className="h-3 w-3" /> {p.boundCharacterIds.length} bound</span>}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground line-clamp-3 flex-1">{p.personality || p.physical || p.backstory || 'No details yet.'}</p>
              <div className="mt-3 flex items-center gap-1">
                <Button size="sm" variant="secondary" onClick={() => setEditing({ ...p })}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                <Button size="icon" variant="ghost" aria-label="Clone persona" onClick={() => clone(p)}><Copy className="h-4 w-4" /></Button>
                {!p.isDefault && <Button size="icon" variant="ghost" aria-label="Set as default" onClick={() => makeDefault(p)}><Star className="h-4 w-4" /></Button>}
                <Button size="icon" variant="ghost" aria-label="Delete persona" className="ml-auto hover:text-destructive" onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? 'Edit persona' : 'New persona'}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row gap-4">
                <ImageField value={editing.avatar} onChange={(avatar) => setEditing({ ...editing, avatar })} label="Persona avatar" />
                <div className="flex-1 space-y-3">
                  <div>
                    <Label htmlFor="p-name">Display name</Label>
                    <Input id="p-name" value={editing.name} maxLength={60} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Aria Valen" />
                  </div>
                  <div>
                    <Label>Pronouns</Label>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {PRONOUN_OPTIONS.map((o) => (
                        <button key={o} type="button" onClick={() => setEditing({ ...editing, pronouns: o })}
                          className={cn('rounded-full px-3 py-1 text-xs font-medium ring-1 transition', editing.pronouns === o ? 'bg-primary text-primary-foreground ring-primary' : 'ring-white/10 hover:ring-primary/50')}>{o}</button>
                      ))}
                      <Input value={pronounPreset ? '' : editing.pronouns} maxLength={40} onChange={(e) => setEditing({ ...editing, pronouns: e.target.value || 'They/Them' })} placeholder="Custom…" className="h-7 w-28 text-xs" />
                    </div>
                  </div>
                </div>
              </div>

              {APPEARANCE_GROUPS.map((group) => (
                <fieldset key={group.title} className="space-y-2">
                  <legend className="text-sm font-medium">{group.title}</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.fields.map((field) => (
                      <div key={field.key}>
                        <Label htmlFor={`app-${field.key}`} className="text-xs text-muted-foreground">{field.label}</Label>
                        <Input
                          id={`app-${field.key}`}
                          value={appearance[field.key]}
                          maxLength={80}
                          placeholder={field.hint}
                          onChange={(e) => setEditing({ ...editing, appearance: { ...appearance, [field.key]: e.target.value } })}
                        />
                      </div>
                    ))}
                  </div>
                </fieldset>
              ))}

              {FIELDS.map((f) => (
                <div key={f.key}>
                  <Label>{f.label}</Label>
                  <AutoTextarea minHeight={70} value={String(editing[f.key] ?? '')} placeholder={f.hint} onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })} />
                </div>
              ))}

              <div className={cn('rounded-lg px-3 py-2 text-xs', tokens > PERSONA_TOKEN_BUDGET ? 'bg-amber-500/10 text-amber-300' : 'bg-secondary text-muted-foreground')}>
                Appearance context ≈ {visualTokens} / {VISUAL_TOKEN_CAP} tokens. Notes and appearance together ≈ {tokens} / {PERSONA_TOKEN_BUDGET}.{tokens > PERSONA_TOKEN_BUDGET && ' Long personas eat into chat memory — consider trimming.'}
              </div>

              <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Global default</p>
                  <p className="text-xs text-muted-foreground">Used in every chat without a bound or chosen persona.</p>
                </div>
                <Switch checked={editing.isDefault} onCheckedChange={(isDefault) => setEditing({ ...editing, isDefault })} />
              </div>

              <div>
                <Label>Bind to characters</Label>
                <p className="text-xs text-muted-foreground mb-2">This persona is used automatically with these characters (one persona per character).</p>
                <CharacterPicker value={editing.boundCharacterIds} onChange={(boundCharacterIds) => setEditing({ ...editing, boundCharacterIds })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save persona</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
