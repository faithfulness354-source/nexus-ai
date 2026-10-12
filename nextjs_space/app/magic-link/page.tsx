import { AuthLayout } from '@/components/layouts/auth-layout';
import { EmailRequestForm, MagicLinkSignIn } from '@/components/auth/recovery-forms';

export const dynamic = 'force-dynamic';

export default async function MagicLinkPage({ searchParams }: { searchParams: Promise<{ token?: string; callbackUrl?: string }> }) {
  const { token, callbackUrl } = await searchParams;
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
