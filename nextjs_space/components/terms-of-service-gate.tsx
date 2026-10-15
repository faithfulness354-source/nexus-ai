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
  const [acceptedTerms, setAcceptedTerms] = useState<boolean | null>(null);
  const [statusSeen, setStatusSeen] = useState(status);
  if (statusSeen !== status) {
    setStatusSeen(status);
    if (status === 'loading') setAcceptedTerms(null);
    else if (status !== 'authenticated') setAcceptedTerms(true);
    else setAcceptedTerms(null);
  }

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancel = false;
    void (async () => {
      try {
        const response = await fetch('/api/account/tos', { cache: 'no-store', credentials: 'include' });
        const body = await response.json().catch(() => null) as { accepted?: boolean } | null;
        if (cancel) return;
        if (!response.ok || !body) {
          setAcceptedTerms(null);
          return;
        }
        setAcceptedTerms(Boolean(body.accepted));
      } catch {
        if (!cancel) setAcceptedTerms(null);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [status]);

  const locked = status === 'authenticated' && acceptedTerms === false && !PUBLIC_LEGAL.has(pathname);

  return (
    <>
      <div key={locked ? 'tos-locked' : 'tos-open'} className={locked ? 'pointer-events-none select-none' : undefined} inert={locked ? true : undefined}>
        {children}
      </div>
      {locked ? <TermsOfServiceModal onAccepted={() => setAcceptedTerms(true)} /> : null}
    </>
  );
}
