import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/layout/site-footer';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Welcome, subscriber · Nexus AI',
  description: 'Thanks for supporting Nexus AI on SubscribeStar. Link your account to unlock your tier.',
};

export default function WelcomeSubscriberPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">SubscribeStar</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Welcome, subscriber
        </h1>
        <p className="mt-4 text-muted-foreground">
          Thanks for supporting Nexus AI on SubscribeStar.adult. Your pledge is billed there — next, link that
          account inside Nexus AI so your Free / Plus ($9.99) / Premium ($29.99) / Ultimate ($50) tier unlocks automatically.
        </p>
        <ol className="mt-8 list-decimal space-y-3 pl-5 text-sm text-foreground/90">
          <li>Sign in to your Nexus AI account (or create one with the same email you used on SubscribeStar when possible).</li>
          <li>Open <strong>Settings → Subscription &amp; Tiers</strong>.</li>
          <li>Click <strong>Connect / Link SubscribeStar Account</strong> and approve the OAuth prompt.</li>
          <li>Your active SubscribeStar tier syncs into Nexus AI. You can re-sync anytime from the same screen.</li>
        </ol>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/settings?tab=subscription"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Open Settings &amp; link account
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 px-5 text-sm font-medium hover:bg-white/5"
          >
            Back to Nexus AI
          </Link>
        </div>
        <p className="mt-8 text-xs text-muted-foreground">
          Need a refund? Requests go through{' '}
          <Link href="/refund-policy" className="text-primary hover:underline">SubscribeStar support</Link>.
          Also see our <Link href="/terms" className="text-primary hover:underline">Terms</Link>,{' '}
          <Link href="/privacy" className="text-primary hover:underline">Privacy</Link>, and{' '}
          <Link href="/prohibited-content" className="text-primary hover:underline">Prohibited Content</Link> pages.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
