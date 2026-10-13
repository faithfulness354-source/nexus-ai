'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TierCard } from './tier-card';
import { PAID_TIERS, TIERS, TIER_ORDER, type AccessStatus, type PaidTierId, type TierId } from '@/lib/tiers';
import { startCheckout } from '@/lib/billing-client';
import { loadPaypalSdk } from '@/lib/paypal-browser';

export type PaywallReason = 'credits' | 'sceneImages' | 'advancedGeneration' | 'customPrompts' | 'proModels' | 'nsfw' | 'vipThemes';

const COPY: Record<PaywallReason, { title: string; body: string; minTier: TierId }> = {
  credits: { title: "You're out of daily credits", body: 'Upgrade to keep the story going right now, or come back after your credits reset.', minTier: 'PLUS' },
  sceneImages: { title: 'Scene images are an Ultimate feature', body: 'Dynamic inline scene rendering with 100 daily image credits is included with Ultimate.', minTier: 'ULTIMATE' },
  advancedGeneration: { title: 'Advanced sampling sliders', body: 'Temperature and Top-P controls unlock with Premium.', minTier: 'PREMIUM' },
  customPrompts: { title: 'Custom system prompts & lorebooks', body: 'Custom system prompts and lorebooks unlock with Plus.', minTier: 'PLUS' },
  proModels: { title: 'Pro models', body: 'The most capable Gemini models unlock with Premium.', minTier: 'PREMIUM' },
  nsfw: { title: '18+ content', body: '18+ NSFW content and scenarios unlock with the Premium or Ultimate plan.', minTier: 'PREMIUM' },
  vipThemes: { title: 'VIP profile themes', body: 'VIP profile themes and the VIP badge are included with Ultimate.', minTier: 'ULTIMATE' },
};

export function PaywallModal({ reason, status, onClose }: { reason: PaywallReason | null; status: AccessStatus | null; onClose: () => void }) {
  const [pending, setPending] = useState<TierId | null>(null);
  useEffect(() => {
    if (!status?.paypalClientId) return;
    void loadPaypalSdk(status.paypalClientId);
  }, [status?.paypalClientId]);
  const copy = COPY[reason ?? 'credits'];
  const current = status?.tier ?? 'FREE';
  const options = PAID_TIERS.filter((t) => TIER_ORDER.indexOf(t) >= Math.max(TIER_ORDER.indexOf(copy.minTier), TIER_ORDER.indexOf(current) + 1));
  const resets = status?.resetsAt ? new Date(status.resetsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;

  async function choose(tier: TierId) {
    setPending(tier);
    try {
      const switched = await startCheckout(tier as PaidTierId);
      if (switched) onClose();
    } catch (err: any) {
      console.error('Checkout failed:', err);
      toast.error(err?.message ?? 'Checkout failed');
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog open={!!reason} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <div className="mx-auto mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-primary/15">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle className="text-center font-display text-xl">{copy.title}</DialogTitle>
          <DialogDescription className="text-center">
            {copy.body}
            {reason === 'credits' && status?.dailyCredits != null && (
              <> You've used all {status.dailyCredits} {TIERS[current].name} credits for today{resets ? `; they reset at ${resets}` : ''}.</>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className={`grid gap-4 pt-2 ${options.length >= 3 ? 'sm:grid-cols-3' : options.length === 2 ? 'sm:grid-cols-2' : ''}`}>
          {options.map((t) => (
            <TierCard key={t} tier={t} currentTier={current} compact loading={pending === t} disabled={!!pending} onSelect={choose} />
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Compare every plan in <Link href="/settings?tab=subscription" onClick={onClose} className="text-primary hover:underline">Subscription &amp; Tiers</Link>.
        </p>
      </DialogContent>
    </Dialog>
  );
}
