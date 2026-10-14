'use client';

import { useEffect } from 'react';

function isField(node: EventTarget | null): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;
  return node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.isContentEditable;
}

/** Keeps the focused field above the soft keyboard on the phone WebView. */
export function MobileKeyboardInset() {
  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (!coarse) return;
    const scrollField = (node: HTMLElement) => {
      window.setTimeout(() => {
        if (document.activeElement !== node) return;
        node.scrollIntoView({ block: 'center', inline: 'nearest' });
      }, 280);
    };
    const onFocus = (event: FocusEvent) => {
      if (isField(event.target)) scrollField(event.target);
    };
    const onResize = () => {
      const active = document.activeElement;
      if (isField(active)) scrollField(active);
    };
    document.addEventListener('focusin', onFocus);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('focusin', onFocus);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, []);
  return null;
}
