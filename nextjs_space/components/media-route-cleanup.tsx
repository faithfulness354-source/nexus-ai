'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

function release(node: Element) {
  if (!(node instanceof HTMLMediaElement)) return;
  if (node.closest('[data-splash]')) return;
  try {
    node.pause();
    node.removeAttribute('src');
    node.load();
  } catch {
    /* The player is already gone. */
  }
}

/** Stops the audio that was playing on the page you just left. */
export function MediaRouteCleanup() {
  const path = usePathname();
  useEffect(() => {
    const playing = Array.from(document.querySelectorAll('audio, video'));
    return () => playing.forEach(release);
  }, [path]);
  return null;
}
