import { AuthLayout } from '@/components/layouts/auth-layout';
import { EmailRequestForm } from '@/components/auth/recovery-forms';

export const metadata = { title: 'Forgot password · NexusAI' };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout title="Forgot your password?" description="Enter your email and we'll send you a secure link to choose a new one.">
      <EmailRequestForm kind="reset" />
    </AuthLayout>
  );
}
