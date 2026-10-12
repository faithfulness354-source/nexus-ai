'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { TermsOfServiceModal } from '@/components/TermsOfServiceModal';

const PUBLIC_LEGAL = new Set(['/terms', '/privacy', '/guidelines', '/dmca']);

/** Locks the signed-in app until this account has accepted the Terms of Service. */
export function TermsOfServiceGate({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const pathname = usePathname();
  const [accepted, setAccepted] = useState<boolean | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'authenticated') {
      setAccepted(true);
      return;
    }
    let cancel = false;
    fetch('/api/account/tos', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { accepted?: boolean } | null) => {
        if (!cancel) setAccepted(Boolean(body?.accepted));
      })
      .catch(() => {
        if (!cancel) setAccepted(null);
      });
    return () => {
      cancel = true;
    };
  }, [status]);

  const locked = status === 'authenticated' && accepted === false && !PUBLIC_LEGAL.has(pathname);

  return (
    <>
      <div key={locked ? 'tos-locked' : 'tos-open'} className={locked ? 'pointer-events-none select-none' : undefined} inert={locked ? true : undefined}>
        {children}
      </div>
      {locked ? <TermsOfServiceModal onAccepted={() => setAccepted(true)} /> : null}
    </>
  );
}
