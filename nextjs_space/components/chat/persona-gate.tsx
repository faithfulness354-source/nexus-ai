'use client';

import Link from 'next/link';
import { Check, Loader2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CharacterAvatar } from '@/components/character/character-avatar';
import type { PersonaData } from '@/lib/hubs';
import { cn } from '@/lib/utils';

export function PersonaGate({
  characterName,
  characterId,
  personas,
  ready,
  selectedId,
  onSelect,
  recentSessionId,
  starting,
  onStart,
  onContinue,
  onDismiss,
}: {
  characterName: string;
  characterId: string;
  personas: PersonaData[];
  ready: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  recentSessionId: string | null;
  starting: boolean;
  onStart: (personaId: string | null) => void;
  onContinue: () => void;
  onDismiss?: () => void;
}) {
  const selected = personas.find((persona) => persona.id === selectedId) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-2xl bg-card p-5 shadow-2xl ring-1 ring-white/10" role="dialog" aria-modal="true" aria-labelledby="persona-gate-title">
        <h2 id="persona-gate-title" className="font-display text-xl font-bold">Choose a persona</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {characterName ? `Who are you when you talk to ${characterName}?` : 'Pick who you are in this chat before it starts.'}
        </p>
        {!ready ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : personas.length === 0 ? (
          <div className="py-8 text-center">
            <UserRound className="mx-auto mb-3 h-8 w-8 text-primary" />
            <p className="font-medium">No saved personas yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Create one to bind a name, appearance, and personality to this chat.</p>
            <Button asChild className="mt-4"><Link href="/dashboard/personas">Create a persona</Link></Button>
          </div>
        ) : (
          <div className="mt-4 space-y-2 overflow-y-auto pr-1">
            {personas.map((persona, personaIndex) => {
              const active = persona.id === selectedId;
              const boundHere = persona.boundCharacterIds.includes(characterId);
              return (
                <button
                  key={`${persona.id}:${personaIndex}`}
                  type="button"
                  onClick={() => onSelect(persona.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition',
                    active ? 'bg-primary/15 ring-primary/50' : 'bg-background/40 ring-white/10 hover:ring-primary/30',
                  )}
                >
                  <CharacterAvatar src={persona.avatar} name={persona.name} className="h-10 w-10 text-sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{persona.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {persona.pronouns}
                      {boundHere ? ' · Bound to this character' : ''}
                      {persona.isDefault ? ' · Default' : ''}
                    </span>
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {onDismiss && (
            <Button variant="ghost" onClick={onDismiss} disabled={starting}>Cancel</Button>
          )}
          {recentSessionId && (
            <Button variant="ghost" onClick={onContinue} disabled={starting}>Continue last chat</Button>
          )}
          <Button onClick={() => onStart(selected?.id ?? null)} disabled={starting || (personas.length > 0 && !selected)}>
            {starting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {selected ? `Start as ${selected.name}` : 'Start chat'}
          </Button>
        </div>
      </div>
    </div>
  );
}
