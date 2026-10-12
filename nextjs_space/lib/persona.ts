'use client';

import { useEffect, useState } from 'react';

const KEY = 'nexus.persona.name';
const EVENT = 'nexus-persona-change';

export function usePersonaName(): [string, (name: string) => void] {
  const [name, setName] = useState('You');

  useEffect(() => {
    const read = () => setName(localStorage.getItem(KEY)?.trim() || 'You');
    read();
    async function pull() {
      try {
        const response = await fetch('/api/personas', { cache: 'no-store' });
        if (!response.ok) return;
        const rows = await response.json();
        if (!Array.isArray(rows)) return;
        const active = rows.find((row) => row?.isDefault) ?? rows[0];
        const next = typeof active?.name === 'string' ? active.name.trim().slice(0, 40) : '';
        if (!next || localStorage.getItem(KEY) === next) return;
        localStorage.setItem(KEY, next);
        window.dispatchEvent(new Event(EVENT));
      } catch {
        // The name already on this device stays until the shared list is reachable.
      }
    }
    void pull();
    window.addEventListener(EVENT, read);
    window.addEventListener('storage', read);
    window.addEventListener('nexus:cloud-revision', pull);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener('storage', read);
      window.removeEventListener('nexus:cloud-revision', pull);
    };
  }, []);

  const update = (next: string) => {
    const v = next.trim().slice(0, 40);
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
  };

  return [name, update];
}
