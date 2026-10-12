import { AuthLayout } from '@/components/layouts/auth-layout';
import { AuthForm } from '@/components/auth/auth-form';

export default function SignupPage() {
  return (
    <AuthLayout title="Create your account" description="Start free with 50 daily credits. Upgrade any time.">
      <AuthForm mode="signup" />
    </AuthLayout>
  );
}
