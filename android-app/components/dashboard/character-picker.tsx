'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { CharacterAvatar } from '@/components/character/character-avatar';
import { cn } from '@/lib/utils';

export interface PickableCharacter { id: string; name: string; avatar: string | null }

let cache: Promise<PickableCharacter[]> | null = null;
export function loadCharacters(): Promise<PickableCharacter[]> {
  cache ??= fetch('/api/characters')
    .then((r) => (r.ok ? r.json() : []))
    .then((d: any) => (Array.isArray(d) ? d.map((c: any) => ({ id: c.id, name: c.name, avatar: c.avatar ?? null })) : []))
    .catch((err) => { console.error('Failed to load characters', err); cache = null; return []; });
  return cache;
}

export function useCharacters() {
  const [list, setList] = useState<PickableCharacter[]>([]);
  useEffect(() => { loadCharacters().then(setList); }, []);
  return list;
}

/** Searchable multi-select list of characters. */
export function CharacterPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void; max?: number }) {
  const characters = useCharacters();
  const [q, setQ] = useState('');
  const filtered = useMemo(
    () => characters.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())),
    [characters, q]
  );
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="rounded-xl bg-background/60 ring-1 ring-white/5">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search characters…"
          className="flex-1 bg-transparent text-sm outline-none"
        />
        <span className="text-[11px] text-muted-foreground">{value.length}</span>
      </div>
      <div className="max-h-56 overflow-y-auto p-1">
        {filtered.map((c) => {
          const on = value.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              className={cn('w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors', on ? 'bg-primary/15' : 'hover:bg-secondary')}
            >
              <CharacterAvatar src={c.avatar} name={c.name} className="h-7 w-7 text-[10px]" />
              <span className="flex-1 truncate">{c.name}</span>
              {on && <Check className="h-4 w-4 text-primary" />}
            </button>
          );
        })}
        {filtered.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">No characters found.</p>}
      </div>
    </div>
  );
}
