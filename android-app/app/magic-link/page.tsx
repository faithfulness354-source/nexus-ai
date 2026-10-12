'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/layouts/auth-layout';
import { EmailRequestForm, MagicLinkSignIn } from '@/components/auth/recovery-forms';

function MagicLinkBody() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const callbackUrl = params.get('callbackUrl') ?? undefined;
  if (token) {
    return (
      <AuthLayout title="Signing you in" description="Hang tight while we verify your link.">
        <MagicLinkSignIn token={token} callbackUrl={callbackUrl} />
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Sign in with a magic link" description="We'll email you a one-time link — no password needed.">
      <EmailRequestForm kind="magic" callbackUrl={callbackUrl} />
    </AuthLayout>
  );
}

export default function MagicLinkPage() {
  return (
    <Suspense fallback={null}>
      <MagicLinkBody />
    </Suspense>
  );
}
