'use client';

import { useEffect, useState } from 'react';

const KEY = 'nexus.persona.name';
const EVENT = 'nexus-persona-change';

export function usePersonaName(): [string, (name: string) => void] {
  const [name, setName] = useState('You');

  useEffect(() => {
    const read = () => setName(localStorage.getItem(KEY)?.trim() || 'You');
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener('storage', read);
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
