import { AuthLayout } from '@/components/layouts/auth-layout';
import { AuthForm } from '@/components/auth/auth-form';

export default function LoginPage() {
  return (
    <AuthLayout title="Welcome back" description="Sign in to continue your stories.">
      <AuthForm mode="login" />
    </AuthLayout>
  );
}
