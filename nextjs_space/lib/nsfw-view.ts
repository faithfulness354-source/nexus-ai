'use client';

import { useEffect, useState } from 'react';
import { NSFW_COOKIE } from '@/lib/nsfw-cookie';

const EVENT = 'nexus-nsfw-view';
const STORAGE_KEY = 'nexus-nsfw-view';

let enabled = false;

export function readNsfwView(): boolean {
  return enabled;
}

/** Saved browser preference. Missing or unreadable values stay off. */
export function readStoredNsfwView(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeNsfwView(on: boolean) {
  enabled = on;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch { /* private mode */ }
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${NSFW_COOKIE}=${on ? '1' : '0'}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeNsfwView(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export function useNsfwView(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const read = () => setOn(enabled);
    read();
    return subscribeNsfwView(read);
  }, []);
  return on;
}
