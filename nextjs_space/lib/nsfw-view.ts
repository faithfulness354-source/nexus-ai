'use client';

import { useEffect, useState } from 'react';

const EVENT = 'nexus-nsfw-view';
let enabled = false;

export function readNsfwView(): boolean {
  return enabled;
}

export function writeNsfwView(on: boolean) {
  enabled = on;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

export function useNsfwView(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const read = () => setOn(enabled);
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);
  return on;
}
