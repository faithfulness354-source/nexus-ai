'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Crown, XCircle, Infinity as InfinityIcon, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { TierCard } from './tier-card';
import { useAccess } from './access-provider';
import { TIERS, TIER_ORDER, type PaidTierId, type TierId } from '@/lib/tiers';
import { startCheckout, cancelSubscription } from '@/lib/billing-client';
import { loadPaypalSdk } from '@/lib/paypal-browser';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function SubscriptionPanel({ checkout }: { checkout?: string }) {
  const { status, refresh } = useAccess();
  const [pending, setPending] = useState<TierId | 'portal' | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (!status?.paypalClientId) return;
    void loadPaypalSdk(status.paypalClientId);
  }, [status?.paypalClientId]);

  // Feedback after returning from PayPal; the webhook may land a moment later, so re-poll briefly.
  useEffect(() => {
    if (handled.current || !checkout) return;
    handled.current = true;
    if (checkout === 'success' || checkout === 'pending') {
      toast.success(checkout === 'success' ? 'Subscription active! Enjoy your new plan.' : 'PayPal is confirming your payment. Your plan will update shortly.');
      const timers = [1000, 5000, 15000].map((ms) => setTimeout(refresh, ms));
      return () => timers.forEach(clearTimeout);
    }
    if (checkout === 'cancelled') toast('Checkout cancelled. You have not been charged.');
    if (checkout === 'error') toast.error('That PayPal subscription does not belong to this account.');
  }, [checkout, refresh]);

  async function choose(tier: TierId) {
    setPending(tier);
    try {
      const switched = await startCheckout(tier as PaidTierId);
      if (switched) await refresh();
    } catch (err: any) {
      console.error('Checkout failed:', err);
      toast.error(err?.message ?? 'Checkout failed');
    } finally {
      setPending(null);
    }
  }

  async function manage() {
    if (!window.confirm('Cancel your subscription? You keep your plan until the end of the current billing period.')) return;
    setPending('portal');
    try {
      await cancelSubscription();
      toast.success('Subscription cancelled. No further PayPal charges.');
      await refresh();
    } catch (err: any) {
      console.error('Cancel subscription failed:', err);
      toast.error(err?.message ?? 'Could not cancel the subscription');
    } finally {
      setPending(null);
    }
  }

  if (!status) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const tier = TIERS[status.tier];
  const pct = status.dailyCredits ? Math.min(100, (status.creditsUsed / status.dailyCredits) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Current status */}
      {status.isAdmin ? (
        <section className="rounded-2xl bg-gradient-to-br from-amber-500/15 via-card to-card p-5 shadow-lg shadow-black/20 ring-1 ring-amber-400/40">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950">
              <Crown className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-400">Creator / Admin</p>
              <h2 className="font-display text-lg font-semibold">Unlimited access</h2>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Your account is on the creator whitelist, so every Ultimate feature is unlocked without any billing: unlimited
            text and image generations, all models, advanced sampling sliders, full context memory, 18+ access, dynamic scene
            rendering and VIP profile themes.
          </p>
        </section>
      ) : (
        <section className="rounded-2xl bg-card p-5 shadow-lg shadow-black/20 ring-1 ring-white/5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Current plan</p>
              <h2 className="font-display text-xl font-semibold">
                {tier.name} <span className="text-sm font-normal text-muted-foreground">${tier.price.toFixed(2)}/month</span>
              </h2>
              {status.currentPeriodEnd && status.hasSubscription && (
                <p className="mt-0.5 text-xs text-muted-foreground">Renews {formatDate(status.currentPeriodEnd)}</p>
              )}
              {status.currentPeriodEnd && status.subscriptionStatus === 'canceling' && (
                <p className="mt-0.5 text-xs text-amber-300">Cancelled. Access ends {formatDate(status.currentPeriodEnd)}</p>
              )}
            </div>
            {status.hasSubscription && (
              <Button variant="outline" size="sm" onClick={manage} loading={pending === 'portal'}>
                <XCircle className="h-4 w-4 mr-1" /> Cancel subscription
              </Button>
            )}
          </div>

          {status.subscriptionStatus === 'past_due' && (
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <AlertTriangle className="h-4 w-4" /> Your last payment failed. Update your payment method in your PayPal account to keep your plan.
            </p>
          )}

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium">Daily credits</span>
              {status.dailyCredits === null ? (
                <span className="inline-flex items-center gap-1 text-primary"><InfinityIcon className="h-4 w-4" /> Unlimited</span>
              ) : (
                <span className="tabular-nums">
                  <span className="font-semibold">{status.creditsRemaining}</span>
                  <span className="text-muted-foreground"> / {status.dailyCredits.toLocaleString('en-US')} left</span>
                </span>
              )}
            </div>
            {status.dailyCredits !== null && <Progress value={pct} className="h-2" />}
            <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {status.dailyCredits === null
                ? `${status.creditsUsed} messages sent today`
                : `1 credit = 1 message. Resets daily at ${formatTime(status.resetsAt)}.`}
            </p>
          </div>

          {status.dailyImageCredits !== null && status.dailyImageCredits > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium">Image / scene credits</span>
                <span className="tabular-nums">
                  <span className="font-semibold">{status.imageCreditsRemaining}</span>
                  <span className="text-muted-foreground"> / {status.dailyImageCredits} left</span>
                </span>
              </div>
              <Progress value={Math.min(100, (status.imageCreditsUsed / status.dailyImageCredits) * 100)} className="h-2" />
            </div>
          )}
          {status.contextTokens !== null && (
            <p className="mt-3 text-xs text-muted-foreground">
              Context window: {Math.round(status.contextTokens / 1000)}k tokens
            </p>
          )}
        </section>
      )}

      {/* Plans */}
      <div>
        <h3 className="mb-3 font-display font-semibold">Plans</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {TIER_ORDER.map((t) => (
            <TierCard
              key={t}
              tier={t}
              currentTier={status.isAdmin ? undefined : status.tier}
              loading={pending === t}
              disabled={pending !== null && pending !== t}
              onSelect={choose}
            />
          ))}
        </div>
        {!status.isAdmin && (
          <p className="mt-3 text-xs text-muted-foreground">
            Secure payments by PayPal (PayPal balance or card). Cancel any time here; you keep your plan until the end of the period.
          </p>
        )}
      </div>
    </div>
  );
}
