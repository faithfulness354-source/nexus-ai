'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Wand2, KeyRound } from 'lucide-react';
import { ResetPasswordInline } from '@/components/auth/reset-password-inline';
import { rememberCloudToken } from '@/lib/cloud-bridge';

/** Only allow same-site relative redirects. */
function safeCallback(url?: string | null) {
  return url && url.startsWith('/') && !url.startsWith('//') ? url : '/';
}

export function AuthForm({ mode, callbackUrl }: { mode: 'login' | 'signup'; callbackUrl?: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'auth' | 'reset'>('auth');
  const target = safeCallback(callbackUrl);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        if (!terms) throw new Error('Agree to the Terms of Service and confirm you are 18 or older.');
        const res = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, termsAccepted: true }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? 'Could not create account');
      }
      const tokenRes = await fetch('/api/cloud/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const tokenBody = await tokenRes.json().catch(() => ({}));
      if (tokenRes.ok && typeof tokenBody?.token === 'string') rememberCloudToken(tokenBody.token);
      const result = await signIn('credentials', { email, password, redirect: false });
      if (!tokenRes.ok && (!result || result.error)) throw new Error(tokenBody?.error ?? 'Invalid email or password');
      if (mode === 'signup') toast.success('Welcome to NexusAI! You start on the Free plan.');
      // Full navigation so the session is picked up everywhere.
      window.location.href = target;
    } catch (err: any) {
      console.error(`${mode} failed:`, err);
      setError(err?.message ?? 'Something went wrong');
      setLoading(false);
    }
  }

  const otherHref = `${mode === 'login' ? '/signup' : '/login'}${target !== '/' ? `?callbackUrl=${encodeURIComponent(target)}` : ''}`;

  if (mode === 'login' && view === 'reset') {
    return <ResetPasswordInline initialEmail={email} target={target} onBack={() => setView('auth')} />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === 'signup' && (
        <div className="space-y-1.5">
          <Label htmlFor="name">Display name</Label>
          <Input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={mode === 'signup' ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        />
      </div>
      {mode === 'signup' && (
        <label className="flex items-start gap-2.5 text-sm leading-snug">
          <Checkbox
            checked={terms}
            onCheckedChange={(checked) => setTerms(checked === true)}
            aria-required="true"
            aria-label="I agree to the Terms of Service and confirm I am 18+ years of age."
            className="mt-0.5"
          />
          <span>
            I agree to the <Link href="/terms" className="font-medium text-primary hover:underline">Terms of Service</Link> and confirm I am 18+ years of age.
          </span>
        </label>
      )}
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" className="w-full" loading={loading}>
        {mode === 'login' ? 'Sign in' : 'Create free account'}
      </Button>
      {mode === 'login' && (
        <button
          type="button"
          onClick={() => { setError(''); setView('reset'); }}
          className="flex w-full items-center justify-center gap-1.5 py-1 text-sm font-medium text-primary hover:underline"
        >
          <KeyRound className="h-4 w-4" />Forgot Password? Reset Password
        </button>
      )}
      {mode === 'login' && (
        <Button asChild variant="outline" className="w-full h-auto min-h-10 py-2 whitespace-normal text-center">
          <Link href={`/magic-link${target !== '/' ? `?callbackUrl=${encodeURIComponent(target)}` : ''}`}>
            <Wand2 className="h-4 w-4 mr-2" />Trouble signing in? Login via Magic Link
          </Link>
        </Button>
      )}
      <p className="text-center text-sm text-muted-foreground">
        {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
        <Link href={otherHref} className="font-medium text-primary hover:underline">
          {mode === 'login' ? 'Sign up' : 'Sign in'}
        </Link>
      </p>
    </form>
  );
}
