'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { MailCheck, Wand2, KeyRound } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

function safeCallback(url?: string | null) {
  return url && url.startsWith('/') && !url.startsWith('//') ? url : '/';
}

function SentNotice({ email, what }: { email: string; what: string }) {
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-primary/15 text-primary flex items-center justify-center">
        <MailCheck className="h-6 w-6" />
      </div>
      <p className="text-sm text-muted-foreground">
        If an account exists for <span className="font-medium text-foreground">{email}</span>, we&apos;ve sent {what}. Check your inbox (and spam folder).
      </p>
      <Link href="/login" className="inline-block text-sm font-medium text-primary hover:underline">Back to sign in</Link>
    </div>
  );
}

/** Request form shared by "forgot password" and "magic link". */
export function EmailRequestForm({ kind, callbackUrl }: { kind: 'reset' | 'magic'; callbackUrl?: string }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(kind === 'reset' ? '/api/account/forgot-password' : '/api/account/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, callbackUrl: safeCallback(callbackUrl) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Something went wrong');
      setSent(true);
    } catch (err: any) {
      console.error(`${kind} request failed:`, err);
      setError(err?.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  if (sent) return <SentNotice email={email} what={kind === 'reset' ? 'a password reset link (valid for 1 hour)' : 'a one-time sign-in link (valid for 15 minutes)'} />;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="recovery-email">Email</Label>
        <Input id="recovery-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
      </div>
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" className="w-full" loading={loading}>
        {kind === 'reset' ? <><KeyRound className="h-4 w-4 mr-2" />Send reset link</> : <><Wand2 className="h-4 w-4 mr-2" />Email me a sign-in link</>}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {kind === 'reset' ? (
          <Link href="/magic-link" className="font-medium text-primary hover:underline">Sign in with a magic link instead</Link>
        ) : (
          <Link href="/forgot-password" className="font-medium text-primary hover:underline">Reset your password instead</Link>
        )}
        {' · '}
        <Link href="/login" className="hover:underline">Back to sign in</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [valid, setValid] = useState<boolean | null>(token ? null : false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tokenSeen, setTokenSeen] = useState(token);
  if (tokenSeen !== token) {
    setTokenSeen(token);
    setValid(token ? null : false);
  }

  useEffect(() => {
    if (!token) return;
    let cancel = false;
    fetch(`/api/account/reset-password?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancel) setValid(!!d?.valid); })
      .catch(() => { if (!cancel) setValid(false); });
    return () => { cancel = true; };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/account/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Could not reset password');
      const result = await signIn('credentials', { email: data.email, password, redirect: false });
      window.location.href = result && !result.error ? '/' : '/login';
    } catch (err: any) {
      console.error('Password reset failed:', err);
      setError(err?.message ?? 'Could not reset password');
      setLoading(false);
    }
  }

  if (valid === null) return <p className="text-center text-sm text-muted-foreground">Checking your link…</p>;
  if (!valid) {
    return (
      <div className="space-y-3 text-center">
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">This reset link is invalid or has expired.</p>
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">Request a new link</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="new-password">New password</Label>
        <Input id="new-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <Input id="confirm-password" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </div>
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" className="w-full" loading={loading}>Save new password &amp; sign in</Button>
    </form>
  );
}

/** Lands from the emailed link and signs the user in with the one-time token. */
export function MagicLinkSignIn({ token, callbackUrl }: { token: string; callbackUrl?: string }) {
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    signIn('magic-link', { token, redirect: false })
      .then((result) => {
        if (!result || result.error) throw new Error('This sign-in link is invalid or has expired.');
        window.location.href = safeCallback(callbackUrl);
      })
      .catch((err: any) => {
        console.error('Magic link sign-in failed:', err);
        setError(err?.message ?? 'Sign-in failed');
      });
  }, [token, callbackUrl]);

  if (!error) return <p className="text-center text-sm text-muted-foreground">Signing you in…</p>;
  return (
    <div className="space-y-3 text-center">
      <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      <Link href="/magic-link" className="text-sm font-medium text-primary hover:underline">Send a new link</Link>
    </div>
  );
}
