'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { toast } from 'sonner';
import { ArrowLeft, KeyRound, MailCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

async function post(body: Record<string, string>) {
  const res = await fetch('/api/account/quick-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? 'Something went wrong');
  return data;
}

/** Inline "Reset Password" view of the Sign In form: email + new password + confirm, then the emailed code. */
export function ResetPasswordInline({ initialEmail, target, onBack }: { initialEmail: string; target: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [previewCode, setPreviewCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function sendCode() {
    const data = await post({ step: 'request', email });
    setCodeSent(true);
    if (data?.previewCode) {
      setPreviewCode(String(data.previewCode));
      setCode(String(data.previewCode));
      toast.success('Email is not set up on this server. Your reset code is shown below.');
      return;
    }
    setPreviewCode('');
    toast.success('Reset code sent — check your inbox.');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setLoading(true);
    try {
      if (!codeSent) {
        await sendCode();
        setLoading(false);
        return;
      }
      const data = await post({ step: 'confirm', email, code, password });
      const result = await signIn('credentials', { email: email.trim().toLowerCase(), password, redirect: false });
      if (!result || result.error) throw new Error('Password updated, but sign-in failed. Please sign in manually.');
      toast.success(data?.admin ? 'Password updated — welcome back, Creator Admin.' : 'Password updated — you are signed in.');
      window.location.href = target;
    } catch (err: any) {
      console.error('Password reset failed:', err);
      const message = err?.message ?? 'Something went wrong';
      setError(message === 'Failed to fetch' ? 'This page cannot reach the Nexus server. On this computer, open http://localhost:3000/login.' : message);
      setLoading(false);
    }
  }

  async function resend() {
    setError('');
    try {
      await sendCode();
    } catch (err: any) {
      console.error('Resend code failed:', err);
      const message = err?.message ?? 'Could not resend the code';
      setError(message === 'Failed to fetch' ? 'This page cannot reach the Nexus server. On this computer, open http://localhost:3000/login.' : message);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">Reset Password</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Choose a new password. Your old password is not needed — we&apos;ll email a one-time code to confirm it&apos;s you.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="reset-email">Email</Label>
        <Input id="reset-email" type="email" required disabled={codeSent} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reset-new">New Password</Label>
        <Input id="reset-new" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reset-confirm">Confirm New Password</Label>
        <Input id="reset-confirm" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat the new password" autoComplete="new-password" />
      </div>
      {codeSent && (
        <div className="space-y-1.5">
          <Label htmlFor="reset-code" className="flex items-center gap-1.5"><MailCheck className="h-4 w-4 text-primary" />Code from your email</Label>
          <Input
            id="reset-code"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="8-character code"
            autoComplete="one-time-code"
            className="font-mono tracking-[0.3em] uppercase"
          />
          {previewCode ? (
            <p className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
              Email is not set up on this server, so the code is here: <span className="font-mono font-semibold tracking-[0.2em]">{previewCode}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Sent to {email} if the account exists. Valid for 15 minutes.</p>
          )}
          <p className="text-xs text-muted-foreground">
            <button type="button" onClick={resend} className="font-medium text-primary hover:underline">Resend</button>
          </p>
        </div>
      )}
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" className="w-full" loading={loading}>
        {codeSent ? 'Reset Password & Sign In' : 'Send Reset Code'}
      </Button>
      <button type="button" onClick={onBack} className="flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Back to Sign In
      </button>
    </form>
  );
}
