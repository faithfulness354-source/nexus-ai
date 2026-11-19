'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Crown, ExternalLink, Infinity as InfinityIcon, AlertTriangle, Clock, Link2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { TierCard } from './tier-card';
import { useAccess } from './access-provider';
import { TIERS, TIER_ORDER, type PaidTierId, type TierId } from '@/lib/tiers';
import { startCheckout, connectSubscribeStar, manageSubscription } from '@/lib/billing-client';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function SubscriptionPanel({ checkout }: { checkout?: string }) {
  const { status, refresh } = useAccess();
  const [pending, setPending] = useState<TierId | 'portal' | 'link' | null>(null);
  const handled = useRef(false);

  // Feedback after SubscribeStar OAuth return (?ss=linked|...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ss = new URLSearchParams(window.location.search).get('ss');
    if (!ss || handled.current) return;
    handled.current = true;
    if (ss === 'linked') {
      toast.success('SubscribeStar account linked. Your tier will unlock automatically.');
      void refresh();
    } else if (ss === 'denied') toast('SubscribeStar linking was cancelled.');
    else if (ss === 'oauth_not_configured') toast.error('SubscribeStar linking is not configured yet.');
    else if (ss === 'error' || ss === 'invalid_state' || ss === 'account_mismatch') {
      toast.error('Could not link SubscribeStar. Try again from Settings.');
    }
  }, [refresh]);

  useEffect(() => {
    if (handled.current || !checkout) return;
    handled.current = true;
    if (checkout === 'success') {
      toast.success('Welcome back — link SubscribeStar in Settings if your tier has not unlocked yet.');
      void refresh();
    }
  }, [checkout, refresh]);

  async function choose(tier: TierId) {
    if (tier === 'FREE') {
      const url = status?.subscribeStarProfileUrl || '/welcome-subscriber';
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    setPending(tier);
    try {
      await startCheckout(tier as PaidTierId);
      toast.message('Finish checkout on SubscribeStar, then link your account here to unlock the tier.');
    } catch (err: any) {
      console.error('Checkout failed:', err);
      toast.error(err?.message ?? 'Checkout failed');
    } finally {
      setPending(null);
    }
  }

  async function manage() {
    setPending('portal');
    try {
      await manageSubscription();
    } catch (err: any) {
      console.error('Manage subscription failed:', err);
      toast.error(err?.message ?? 'Could not open SubscribeStar');
    } finally {
      setPending(null);
    }
  }

  function linkAccount() {
    setPending('link');
    connectSubscribeStar();
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
      {/* SubscribeStar link status */}
      {!status.isAdmin && (
        <section className="rounded-2xl bg-card p-5 shadow-lg shadow-black/20 ring-1 ring-white/5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">SubscribeStar</p>
              {status.subscribeStarLinked ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  <h2 className="font-display text-lg font-semibold">SubscribeStar Account Connected</h2>
                  {status.subscribeStarUsername && (
                    <span className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">
                      @{status.subscribeStarUsername}
                    </span>
                  )}
                  <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                    {TIERS[status.tier].name}
                  </span>
                </div>
              ) : (
                <>
                  <h2 className="mt-1 font-display text-lg font-semibold">Connect / Link SubscribeStar Account</h2>
                  <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                    After you subscribe on SubscribeStar.adult, link your account here so Nexus AI can unlock your Plus, Premium, or Ultimate tier automatically.
                  </p>
                </>
              )}
            </div>
            {status.subscribeStarLinked ? (
              <Button variant="outline" size="sm" onClick={linkAccount} loading={pending === 'link'}>
                <Link2 className="mr-1 h-4 w-4" /> Re-sync
              </Button>
            ) : (
              <Button size="sm" onClick={linkAccount} loading={pending === 'link'}>
                <Link2 className="mr-1 h-4 w-4" /> Connect / Link SubscribeStar Account
              </Button>
            )}
          </div>
        </section>
      )}

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
            Your account is on the creator whitelist, so every Ultimate feature is unlocked without billing.
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
                <p className="mt-0.5 text-xs text-muted-foreground">Paid through {formatDate(status.currentPeriodEnd)}</p>
              )}
              {status.currentPeriodEnd && status.subscriptionStatus === 'canceling' && (
                <p className="mt-0.5 text-xs text-amber-300">Cancelled. Access ends {formatDate(status.currentPeriodEnd)}</p>
              )}
            </div>
            {status.hasSubscription && (
              <Button variant="outline" size="sm" onClick={manage} loading={pending === 'portal'}>
                <ExternalLink className="mr-1 h-4 w-4" /> Manage on SubscribeStar
              </Button>
            )}
          </div>

          {status.subscriptionStatus === 'past_due' && (
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <AlertTriangle className="h-4 w-4" /> Your last SubscribeStar payment failed. Update billing on SubscribeStar to keep your plan.
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
              freeSelectable
            />
          ))}
        </div>
        {!status.isAdmin && (
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            <p>
              Subscriptions are billed through{' '}
              <a
                href={status.subscribeStarProfileUrl || 'https://www.subscribestar.adult'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                SubscribeStar.adult
              </a>
              . After you subscribe, return here and click <strong>Connect / Link SubscribeStar Account</strong> so your tier unlocks automatically.
            </p>
            <p>
              <Link href="/refund-policy" className="text-primary hover:underline">Refund Policy</Link>
              {' · '}
              <Link href="/terms" className="text-primary hover:underline">Terms</Link>
              {' · '}
              <Link href="/privacy" className="text-primary hover:underline">Privacy</Link>
              {' · '}
              <Link href="/prohibited-content" className="text-primary hover:underline">Prohibited Content</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
