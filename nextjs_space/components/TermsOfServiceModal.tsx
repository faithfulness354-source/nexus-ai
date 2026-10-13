'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { terms } from '@/src/content/legal/terms';
import type { LegalBlock } from '@/src/content/legal/types';

type Props = { onAccepted: () => void };

function plain(text: string): string {
  return text.replace(/\[\[([^|\]]+)\|[^\]]+\]\]/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1');
}

function Block({ block }: { block: LegalBlock }) {
  if (block.kind === 'list') {
    return (
      <ul className="list-disc space-y-1 pl-5">
        {block.items.map((item) => <li key={item}>{plain(item)}</li>)}
      </ul>
    );
  }
  return <p>{plain(block.text)}</p>;
}

export function TermsOfServiceModal({ onAccepted }: Props) {
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function accept() {
    if (!checked || saving) return;
    setSaving(true);
    setError('');
    try {
      const client = supabaseBrowser();
      const session = client ? (await client.auth.getSession()).data.session : null;
      const headers = new Headers({ 'Content-Type': 'application/json' });
      if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
      const saved = await fetch('/api/account/tos', { method: 'POST', headers, credentials: 'include' });
      const body = await saved.json().catch(() => null);
      if (!saved.ok || !body?.accepted) throw new Error(body?.error || 'Save failed');

      if (client && session?.user) {
        const stamp = new Date().toISOString();
        const { error } = await client
          .from('profiles')
          .update({
            accepted_tos: true,
            terms_accepted: true,
            tos_accepted_at: stamp,
            terms_accepted_at: stamp,
          })
          .eq('id', session.user.id);
        if (error) throw new Error(error.message);
      }
      setError('');
      onAccepted();
    } catch {
      setError('Could not save your acceptance. Try again.');
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tos-title"
      className="fixed inset-0 z-[190] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-[min(40rem,calc(100dvh-2rem))] w-full max-w-lg flex-col rounded-2xl border border-border bg-background shadow-2xl">
        <div className="border-b border-border px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Nexus AI</p>
          <h2 id="tos-title" className="mt-1 font-display text-xl font-bold">Terms of Service</h2>
          <p className="mt-1 text-xs text-muted-foreground">Effective {terms.effective}. Read these terms before continuing.</p>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-foreground/90">
          {terms.sections.map((section) => (
            <section key={section.title} className="space-y-2">
              <h3 className="font-display text-base font-semibold text-foreground">{section.title}</h3>
              {section.blocks.map((block, index) => <Block key={index} block={block} />)}
            </section>
          ))}
        </div>
        <div className="space-y-3 border-t border-border px-5 py-4">
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={checked}
              onCheckedChange={(value) => setChecked(value === true)}
              aria-label="I am at least 18 years old and agree to the Terms of Service."
              className="mt-0.5"
            />
            <span>I am at least 18 years old and agree to the Terms of Service.</span>
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="button" className="w-full" disabled={!checked || saving} loading={saving} onClick={() => void accept()}>
            Accept & Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
