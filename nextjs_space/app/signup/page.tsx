import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AuthLayout } from '@/components/layouts/auth-layout';
import { AuthForm } from '@/components/auth/auth-form';

export const dynamic = 'force-dynamic';

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  const session = await auth();
  if (session?.user) redirect('/');
  return (
    <AuthLayout title="Create your account" description="Start free with 50 daily credits. Upgrade any time.">
      <AuthForm mode="signup" callbackUrl={callbackUrl} />
    </AuthLayout>
  );
}
