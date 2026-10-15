'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AutoTextarea } from '@/components/editor/auto-textarea';
import { PRONOUN_OPTIONS, type PersonaData } from '@/lib/hubs';
import { APPEARANCE_GROUPS, parseAppearance } from '@/lib/persona-appearance';
import { cn } from '@/lib/utils';

const NOTES: { key: 'physical' | 'visualTraits' | 'attire' | 'personality' | 'backstory' | 'speech'; label: string }[] = [
  { key: 'physical', label: 'Extra physical notes' },
  { key: 'visualTraits', label: 'Extra body notes' },
  { key: 'attire', label: 'Extra outfit notes' },
  { key: 'personality', label: 'Personality' },
  { key: 'backstory', label: 'Backstory' },
  { key: 'speech', label: 'Speech patterns' },
];

export function PersonaEditor({
  persona,
  onClose,
  onSaved,
}: {
  persona: PersonaData | null;
  onClose: () => void;
  onSaved: (persona: PersonaData) => void;
}) {
  const [draft, setDraft] = useState<PersonaData | null>(persona);
  const [saving, setSaving] = useState(false);
  const [personaSeen, setPersonaSeen] = useState(persona);
  if (personaSeen !== persona) {
    setPersonaSeen(persona);
    setDraft(persona);
  }
  const appearance = draft ? parseAppearance(draft.appearance) : null;
  const pronounPreset = draft ? (PRONOUN_OPTIONS as readonly string[]).includes(draft.pronouns) : true;

  async function save() {
    if (!draft?.name.trim()) return toast.error('Display name is required');
    setSaving(true);
    try {
      const res = await fetch(`/api/personas/${draft.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, appearance }),
      });
      const saved = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(saved?.error ?? 'Could not save persona');
      toast.success('Persona updated');
      onSaved(saved);
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not save persona');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!persona} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit persona</DialogTitle>
        </DialogHeader>
        {draft && appearance && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-persona-name">Display name</Label>
              <Input id="edit-persona-name" value={draft.name} maxLength={60} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </div>
            <div>
              <Label>Pronouns</Label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {PRONOUN_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDraft({ ...draft, pronouns: option })}
                    className={cn('rounded-full px-3 py-1 text-xs font-medium ring-1', draft.pronouns === option ? 'bg-primary text-primary-foreground ring-primary' : 'ring-white/10')}
                  >
                    {option}
                  </button>
                ))}
                <Input
                  value={pronounPreset ? '' : draft.pronouns}
                  maxLength={40}
                  placeholder="Custom…"
                  className="h-7 w-28 text-xs"
                  onChange={(event) => setDraft({ ...draft, pronouns: event.target.value || 'They/Them' })}
                />
              </div>
            </div>
            {APPEARANCE_GROUPS.map((group) => (
              <fieldset key={group.title} className="space-y-2">
                <legend className="text-sm font-medium">{group.title}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.fields.map((field) => (
                    <div key={field.key}>
                      <Label htmlFor={`edit-${field.key}`} className="text-xs text-muted-foreground">{field.label}</Label>
                      <Input
                        id={`edit-${field.key}`}
                        value={appearance[field.key]}
                        maxLength={80}
                        placeholder={field.hint}
                        onChange={(event) => setDraft({ ...draft, appearance: { ...appearance, [field.key]: event.target.value } })}
                      />
                    </div>
                  ))}
                </div>
              </fieldset>
            ))}
            {NOTES.map((field) => (
              <div key={field.key}>
                <Label>{field.label}</Label>
                <AutoTextarea minHeight={70} value={draft[field.key] ?? ''} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} />
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
