'use client';

import { useEffect } from 'react';

const REVISION_KEY = 'nexus-live-revision';

type AppHandle = { remove: () => Promise<void> };

type NativeWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: {
      App?: {
        addListener: (
          event: 'appStateChange',
          listener: (state: { isActive: boolean }) => void,
        ) => Promise<AppHandle>;
      };
    };
  };
};

function safeToReload(): boolean {
  const el = document.activeElement;
  if (!el || el === document.body) return true;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
  return !(el as HTMLElement).isContentEditable;
}

/** On the Capacitor shell, reload when the live server reports a new deployment. */
export function LiveUpdateCheck() {
  useEffect(() => {
    const native = (window as NativeWindow).Capacitor?.isNativePlatform?.() === true;
    if (!native) return;

    let stopped = false;
    let known = sessionStorage.getItem(REVISION_KEY);

    async function check() {
      try {
        const res = await fetch('/api/live', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json() as { ok?: boolean; revision?: string };
        const revision = data.ok && data.revision ? String(data.revision) : '';
        if (!revision) return;
        if (known && known !== revision && safeToReload()) {
          sessionStorage.setItem(REVISION_KEY, revision);
          window.location.reload();
          return;
        }
        known = revision;
        sessionStorage.setItem(REVISION_KEY, revision);
      } catch (error) {
        console.log(`Live update check failed: ${error}`);
      }
    }

    void check();
    const timer = window.setInterval(() => {
      if (!stopped && document.visibilityState === 'visible') void check();
    }, 60_000);

    let remove = () => {};
    const app = (window as NativeWindow).Capacitor?.Plugins?.App;
    if (app) {
      void app.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void check();
      }).then((handle) => {
        if (stopped) {
          void handle.remove();
          return;
        }
        remove = () => { void handle.remove(); };
      }).catch((error) => {
        console.log(`Live update listener failed: ${error}`);
      });
    }

    return () => {
      stopped = true;
      window.clearInterval(timer);
      remove();
    };
  }, []);

  return null;
}
