'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Crown, Menu, Sparkles } from 'lucide-react';
import { NavDrawer } from './nav-drawer';
import { ProfileMenu } from './profile-menu';
import { useAccess } from '@/components/billing/access-provider';

/** Gold badge shown in the navbar for whitelisted creator/admin accounts. */
function CreatorBadge() {
  return (
    <Link
      href="/settings?tab=subscription"
      title="Creator / Admin: unlimited access"
      className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 px-1.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-amber-950 shadow-[0_0_14px_rgba(251,191,36,0.45)] ring-1 ring-amber-200/60 sm:px-2.5 sm:text-[11px] sm:tracking-wider"
    >
      <Crown className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Creator / Admin</span>
      <span className="sm:hidden">Admin</span>
    </Link>
  );
}

/** Small remaining-credits pill for regular accounts. */
function CreditsPill() {
  const { status } = useAccess();
  if (!status?.authenticated || status.isAdmin) return null;
  const label = status.creditsRemaining === null ? '∞' : String(status.creditsRemaining);
  const images = status.dailyImageCredits !== null && status.dailyImageCredits > 0
    ? ` · ${status.imageCreditsRemaining ?? 0} images`
    : '';
  const low = status.creditsRemaining !== null && status.creditsRemaining <= 5;
  return (
    <Link
      href="/settings?tab=subscription"
      title={`${status.tier} plan: daily credits remaining`}
      className={`hidden sm:inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition-colors ${low ? 'bg-red-500/10 text-red-300 ring-red-500/30' : 'bg-secondary text-muted-foreground ring-white/5 hover:text-foreground'}`}
    >
      <Sparkles className="h-3 w-3 text-primary" />
      {label} credits{images}
    </Link>
  );
}

interface AppHeaderProps {
  /** Replaces the logo next to the menu button (e.g. chat character info). */
  left?: React.ReactNode;
  /** Optional middle content (e.g. search), shown from md upwards. */
  center?: React.ReactNode;
  right?: React.ReactNode;
  /** Hide the profile avatar menu (e.g. chat view uses its own 3-dot menu). */
  hideProfile?: boolean;
}

export function AppHeader({ left, center, right, hideProfile }: AppHeaderProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const openDrawer = useCallback(() => setOpen(true), []);
  const { status } = useAccess();

  return (
    <>
      <header
        className="sticky top-0 z-40 box-border flex w-full max-w-full shrink-0 items-center gap-1.5 overflow-hidden border-b border-border bg-background/85 px-2 backdrop-blur-md sm:h-14 sm:gap-2 sm:px-4"
        style={{
          paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
          minHeight: 'calc(3.5rem + max(0.5rem, env(safe-area-inset-top)))',
        }}
      >
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={openDrawer}
          className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center overflow-hidden">
          {left ?? (
            <Link href="/" className="flex min-w-0 items-center gap-1.5">
              <Sparkles className="h-5 w-5 shrink-0 text-primary sm:h-6 sm:w-6" />
              <span className="truncate font-display text-base font-bold tracking-tight sm:text-lg">NexusAI</span>
            </Link>
          )}
        </div>
        {center && <div className="hidden min-w-0 flex-1 justify-center px-2 md:flex lg:px-6"><div className="w-full max-w-xl">{center}</div></div>}
        {(right || !hideProfile || status?.isAdmin) && (
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {status?.isAdmin ? <CreatorBadge /> : <CreditsPill />}
            {right}
            {!hideProfile && <ProfileMenu onOpenDrawer={openDrawer} />}
          </div>
        )}
      </header>
      <NavDrawer open={open} onClose={close} />
    </>
  );
}
