'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Pencil, Shield, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { CARD_VISIBILITIES, visibilityBadgeClass, visibilityLabel, type CardVisibility } from '@/lib/card-visibility';

interface DirectoryCard {
  id: string;
  name: string;
  creator: string;
  visibility: CardVisibility;
  moderated: boolean;
  nsfw: boolean;
  updatedAt: string;
  owner: { username: string | null; displayName: string | null } | null;
}

export function CardsDirectory() {
  const [cards, setCards] = useState<DirectoryCard[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    function onDeleted(event: Event) {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      setCards((prev) => (prev ?? []).filter((card) => card.id !== id));
    }
    window.addEventListener('nexus:character-deleted', onDeleted);
    return () => window.removeEventListener('nexus:character-deleted', onDeleted);
  }, []);

  useEffect(() => {
    fetch('/api/admin/cards')
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) { setDenied(true); setCards([]); return; }
        if (!res.ok) throw new Error('Failed to load cards');
        setCards(await res.json());
      })
      .catch(() => { toast.error('Could not load the card directory'); setCards([]); });
  }, []);

  async function patch(id: string, body: { visibility?: CardVisibility; moderated?: boolean }) {
    setBusy(id);
    try {
      const res = await fetch('/api/admin/cards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Update failed');
      setCards((prev) => (prev ?? []).map((card) => (card.id === id ? { ...card, ...data } : card)));
    } catch (err: any) {
      toast.error(err?.message ?? 'Update failed');
    } finally {
      setBusy(null);
    }
  }

  async function remove(card: DirectoryCard) {
    if (!window.confirm(`Delete “${card.name}”? This cannot be undone.`)) return;
    setBusy(card.id);
    try {
      const res = await fetch(`/api/characters/${card.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Delete failed');
      setCards((prev) => (prev ?? []).filter((item) => item.id !== card.id));
      toast.success('Card deleted');
    } catch (err: any) {
      toast.error(err?.message ?? 'Delete failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
        <div className="mb-5 flex items-center gap-2">
          <Shield className="h-5 w-5 text-amber-400" />
          <h2 className="font-display text-2xl font-bold tracking-tight">Card directory</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">Every character card on the site, including private drafts. Visibility and takedowns apply immediately.</p>
        {cards === null ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : denied ? (
          <p className="text-sm text-muted-foreground">Only the creator admin can open the card directory.</p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No character cards yet.</p>
        ) : (
          <div className="space-y-3">
            {cards.map((card) => {
              const author = card.owner?.displayName || card.owner?.username || card.creator || 'Unknown';
              return (
                <article key={card.id} className="rounded-2xl bg-card p-4 shadow-lg shadow-black/20 ring-1 ring-white/5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-display font-semibold">{card.name || 'Unnamed'}</h3>
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${visibilityBadgeClass(card.visibility, card.moderated)}`}>
                          {visibilityLabel(card.visibility, card.moderated)}
                        </span>
                        {card.nsfw && <span className="rounded-md bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">NSFW</span>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">by {author}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/characters/${card.id}/edit`}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Link>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => remove(card)} disabled={busy === card.id}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {CARD_VISIBILITIES.map((state) => (
                      <button
                        key={state}
                        type="button"
                        disabled={busy === card.id}
                        onClick={() => patch(card.id, { visibility: state })}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ring-1 ${card.visibility === state ? 'bg-primary text-primary-foreground ring-primary' : 'text-muted-foreground ring-white/10 hover:text-foreground'}`}
                      >
                        {state === 'PRIVATE' ? 'Private' : state === 'PUBLIC' ? 'Public' : 'Unlisted'}
                      </button>
                    ))}
                    <label className="ml-auto flex items-center gap-2 text-xs">
                      Disabled
                      <Switch checked={card.moderated} disabled={busy === card.id} onCheckedChange={(on) => patch(card.id, { moderated: on })} />
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
        )}
    </section>
  );
}
