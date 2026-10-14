'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAccess } from '@/components/billing/access-provider';
import { BoxGlitchLayers } from '@/components/profile/box-glitch';
import { useNsfwView, writeNsfwView } from '@/lib/nsfw-view';
import type { AccessStatus } from '@/lib/tiers';

const NSFW_TIER_NAME = 'Premium';

/** Creator and admin accounts toggle without a paid plan. Premium unlocks it for everyone else. */
function mayToggleNsfw(status: AccessStatus | null): boolean {
  if (!status) return false;
  if (status.isAdmin || status.isCreatorAdmin) return true;
  return !!status.can.nsfw;
}

/** Profile-only content preference. Off until an allowed account turns it on. */
export function NsfwContentSetting() {
  const nsfwOn = useNsfwView();
  const { status, requestNsfw, refresh } = useAccess();
  const allowed = mayToggleNsfw(status);
  const [pending, setPending] = useState(false);
  const [lockedOpen, setLockedOpen] = useState(false);

  async function change(next: boolean) {
    if (!allowed || pending) return;
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
    <div className="settings-panel mb-6 flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
      <BoxGlitchLayers />
      <div className="min-w-0">
        <p className="text-sm font-semibold">Allow NSFW content</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Off by default. When this is on, adult cards appear with the rest of Browse, search, and profile decks. The choice is saved to your account.
        </p>
        {!allowed && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            <Lock className="h-3 w-3" />
            Requires Active Subscription to Enable
          </p>
        )}
      </div>
      <div className="relative">
        <Switch
          checked={allowed && nsfwOn}
          disabled={!allowed || pending}
          onCheckedChange={(value) => void change(value)}
          aria-label="Allow NSFW content"
        />
        {!allowed && (
          <button
            type="button"
            className="absolute inset-0 cursor-pointer rounded-full"
            aria-label="NSFW content is locked"
            onClick={() => setLockedOpen(true)}
          />
        )}
      </div>
      <Dialog open={lockedOpen} onOpenChange={setLockedOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <div className="mx-auto mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-primary/15">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle className="text-center font-display text-xl">Premium required</DialogTitle>
            <DialogDescription className="text-center">
              You are not subscribed to this specific tier. This feature is locked. If you wish to view NSFW cards, you must subscribe to {NSFW_TIER_NAME}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button asChild>
              <Link href="/subscribe">View {NSFW_TIER_NAME} plans</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
