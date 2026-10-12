'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { useAccess } from '@/components/billing/access-provider';
import { useNsfwView, writeNsfwView } from '@/lib/nsfw-view';

/** Account content preference. Off until the viewer turns it on from profile settings. */
export function NsfwContentSetting() {
  const nsfwOn = useNsfwView();
  const { requestNsfw } = useAccess();
  const [pending, setPending] = useState(false);

  async function change(next: boolean) {
    if (pending) return;
    setPending(true);
    try {
      if (!next) {
        writeNsfwView(false);
        return;
      }
      writeNsfwView(await requestNsfw());
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold">NSFW content</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Off by default. Adult cards stay hidden on Home, search, and profile pages until you turn this on. The choice is saved in this browser.
        </p>
      </div>
      <Switch checked={nsfwOn} disabled={pending} onCheckedChange={(value) => void change(value)} aria-label="Show NSFW content" />
    </div>
  );
}
