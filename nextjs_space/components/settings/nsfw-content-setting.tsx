'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useAccess } from '@/components/billing/access-provider';
import { useNsfwView, writeNsfwView } from '@/lib/nsfw-view';

/** Profile-only content preference. Off until a paid account turns it on. */
export function NsfwContentSetting() {
  const nsfwOn = useNsfwView();
  const { status, requestNsfw, refresh } = useAccess();
  const subscribed = !!status?.can.nsfw;
  const [pending, setPending] = useState(false);

  async function change(next: boolean) {
    if (!subscribed || pending) return;
    setPending(true);
    try {
      const enabled = next ? await requestNsfw() : false;
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nsfwEnabled: enabled }),
      });
      if (!res.ok) {
        writeNsfwView(false);
        return;
      }
      writeNsfwView(enabled);
      await refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold">Allow NSFW content</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Off by default. When this is on, adult cards appear with the rest of Browse, search, and profile decks. The choice is saved to your account.
        </p>
        {!subscribed && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            <Lock className="h-3 w-3" />
            Requires Active Subscription to Enable
          </p>
        )}
      </div>
      <Switch
        checked={subscribed && nsfwOn}
        disabled={!subscribed || pending}
        onCheckedChange={(value) => void change(value)}
        aria-label="Allow NSFW content"
      />
    </div>
  );
}
