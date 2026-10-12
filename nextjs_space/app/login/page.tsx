import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AuthLayout } from '@/components/layouts/auth-layout';
import { AuthForm } from '@/components/auth/auth-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  const session = await auth();
  if (session?.user) redirect(callbackUrl?.startsWith('/') && !callbackUrl.startsWith('//') ? callbackUrl : '/');
  return (
    <AuthLayout title="Welcome back" description="Sign in to continue your stories.">
      <AuthForm mode="login" callbackUrl={callbackUrl} />
    </AuthLayout>
  );
}
