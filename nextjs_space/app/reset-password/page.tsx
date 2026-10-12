import { AuthLayout } from '@/components/layouts/auth-layout';
import { ResetPasswordForm } from '@/components/auth/recovery-forms';

export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthLayout title="Choose a new password" description="Pick a password with at least 8 characters.">
      <ResetPasswordForm token={token ?? ''} />
    </AuthLayout>
  );
}
