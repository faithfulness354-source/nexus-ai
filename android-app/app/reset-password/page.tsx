'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/layouts/auth-layout';
import { ResetPasswordForm } from '@/components/auth/recovery-forms';

function ResetPasswordBody() {
  const token = useSearchParams().get('token') ?? '';
  return (
    <AuthLayout title="Choose a new password" description="Pick a password with at least 8 characters.">
      <ResetPasswordForm token={token} />
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordBody />
    </Suspense>
  );
}
