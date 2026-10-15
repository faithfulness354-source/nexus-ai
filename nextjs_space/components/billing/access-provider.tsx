'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AgeGateModal } from '@/components/safety/age-gate-modal';
import { getAgeVerified, setAgeVerified } from '@/lib/age-gate';
import { readNsfwView, writeNsfwView } from '@/lib/nsfw-view';
import { useSession } from 'next-auth/react';
import type { AccessStatus } from '@/lib/tiers';
import { useAuth } from '@/lib/use-auth';
import { PaywallModal, type PaywallReason } from './paywall-modal';

interface AccessContextValue {
  status: AccessStatus | null;
  refresh: () => Promise<void>;
  openPaywall: (reason?: PaywallReason) => void;
  /** Runs the 18+ age gate and subscriber check; resolves true only when NSFW may be enabled. */
  requestNsfw: () => Promise<boolean>;
}

const AccessContext = createContext<AccessContextValue>({
  status: null,
  refresh: async () => {},
  openPaywall: () => {},
  requestNsfw: async () => false,
});

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const { status: sessionStatus } = useSession();
  // HARD GUARD: NEVER MODIFY OR STRIP IS_ADMIN PERMISSION CHECKS
  const { is_admin } = useAuth();
  const [status, setStatus] = useState<AccessStatus | null>(null);
  const [paywall, setPaywall] = useState<PaywallReason | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/status', { cache: 'no-store' });
      if (res.ok) setStatus(await res.json());
    } catch (err) {
      console.error('Failed to load subscription status:', err);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    void (async () => { await refresh(); })();
  }, [sessionStatus, refresh]);

  // Restore a saved profile preference only when this account may still view adult cards.
  useEffect(() => {
    if (!status) return;
    const saved = !!status.nsfwEnabled;
    const allowed = !!status.can.nsfw && saved && (status.isAdmin || status.isCreatorAdmin || getAgeVerified() === true);
    if (saved && allowed) {
      if (!readNsfwView()) writeNsfwView(true);
      return;
    }
    if (readNsfwView() || saved) writeNsfwView(false);
  }, [status]);

  // HARD GUARD: NEVER MODIFY OR STRIP IS_ADMIN PERMISSION CHECKS
  const openPaywall = useCallback(
    (reason: PaywallReason = 'credits') => {
      if (is_admin || status?.isAdmin || status?.isCreatorAdmin) return;
      setPaywall(reason);
    },
    [is_admin, status?.isAdmin, status?.isCreatorAdmin],
  );

  // Age gate: 'form' asks for DOB, 'denied' shows the under-18 message.
  const [ageGate, setAgeGate] = useState<'form' | 'denied' | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
  }, []);

  /** Loads the live entitlement. Creator admins pass. Paid NSFW plans pass. Everyone else gets the upgrade prompt. */
  const checkSubscriber = useCallback(async (): Promise<AccessStatus | null> => {
    let current = status;
    try {
      const res = await fetch('/api/billing/status', { cache: 'no-store' });
      if (res.ok) { current = await res.json(); setStatus(current); }
    } catch (err) {
      console.error('Failed to refresh subscription status:', err);
    }
    return current;
  }, [status]);

  const allowNsfw = useCallback((current: AccessStatus | null): boolean => {
    if (current?.isAdmin || current?.isCreatorAdmin || current?.can?.nsfw) return true;
    setPaywall('nsfw');
    return false;
  }, []);

  const requestNsfw = useCallback(async (): Promise<boolean> => {
    settle(false);
    const current = await checkSubscriber();
    // The creator account already confirmed 18+ and bypasses payment and plan limits.
    if (current?.isAdmin || current?.isCreatorAdmin || is_admin) return true;
    const verified = getAgeVerified();
    if (verified === false) { setAgeGate('denied'); return false; }
    if (verified === true) return allowNsfw(current);
    setAgeGate('form');
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, [allowNsfw, checkSubscriber, is_admin, settle]);

  const onAgeSubmit = useCallback(async (age: number) => {
    if (age < 18) {
      setAgeVerified(false);
      setAgeGate('denied');
      settle(false);
      return;
    }
    setAgeVerified(true);
    setAgeGate(null);
    settle(allowNsfw(await checkSubscriber()));
  }, [allowNsfw, checkSubscriber, settle]);

  const closeAgeGate = useCallback(() => { setAgeGate(null); settle(false); }, [settle]);

  return (
    <AccessContext.Provider value={{ status, refresh, openPaywall, requestNsfw }}>
      {children}
      <PaywallModal reason={paywall} status={status} onClose={() => setPaywall(null)} />
      <AgeGateModal open={!!ageGate} denied={ageGate === 'denied'} onSubmit={onAgeSubmit} onClose={closeAgeGate} />
    </AccessContext.Provider>
  );
}

export const useAccess = () => useContext(AccessContext);
