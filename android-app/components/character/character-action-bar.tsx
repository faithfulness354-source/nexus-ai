'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Loader2, MessageSquare, Pencil, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAccess } from '@/components/billing/access-provider';
import { readLastPersonaId, suggestPersonaId, writeLastPersonaId } from '@/lib/persona-choice';
import { cn } from '@/lib/utils';

type PersonaOption = {
  id: string;
  name: string;
  isDefault?: boolean;
  boundCharacterIds?: string[];
};

/**
 * Janitor-style bottom controls on the character card view:
 * Edit (owners), persona picker, and start chat — clear of safe-area / system bars.
 */
export function CharacterActionBar({
  characterId,
  characterName,
  canEdit,
}: {
  characterId: string;
  characterName: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { status: access } = useAccess();
  const signedIn = !!access?.authenticated;

  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [personaId, setPersonaId] = useState<string>('');
  const [personasReady, setPersonasReady] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!signedIn) {
      setPersonas([]);
      setPersonaId('');
      setPersonasReady(true);
      return;
    }
    let cancelled = false;
    setPersonasReady(false);
    void (async () => {
      try {
        const res = await fetch('/api/personas', { cache: 'no-store' });
        const data = res.ok ? await res.json().catch(() => null) : null;
        if (cancelled) return;
        const list: PersonaOption[] = Array.isArray(data)
          ? data.filter((p: unknown) => p && typeof (p as PersonaOption).id === 'string' && typeof (p as PersonaOption).name === 'string')
          : [];
        setPersonas(list.map((p) => ({
          id: p.id,
          name: p.name,
          isDefault: !!p.isDefault,
          boundCharacterIds: Array.isArray(p.boundCharacterIds) ? p.boundCharacterIds : [],
        })));
        const suggested = suggestPersonaId(
          list.map((p) => ({
            id: p.id,
            isDefault: !!p.isDefault,
            boundCharacterIds: Array.isArray(p.boundCharacterIds) ? p.boundCharacterIds : [],
          })),
          characterId,
          readLastPersonaId(),
        );
        setPersonaId(suggested || '');
      } catch {
        if (!cancelled) {
          setPersonas([]);
          setPersonaId('');
        }
      } finally {
        if (!cancelled) setPersonasReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [signedIn, characterId]);

  async function startChat() {
    if (!signedIn) {
      router.push(`/login?callbackUrl=${encodeURIComponent(`/characters/${characterId}`)}`);
      return;
    }
    setStarting(true);
    try {
      const chosen = personaId || null;
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, personaId: chosen }),
      });
      const session = await res.json().catch(() => ({}));
      if (!res.ok || !session?.id) throw new Error(session?.error ?? 'Could not start chat');
      if (chosen) writeLastPersonaId(chosen);
      router.push(`/characters/${characterId}/chat?session=${session.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not start chat');
    } finally {
      setStarting(false);
    }
  }

  const selected = personas.find((p) => p.id === personaId) ?? null;

  return (
    <>
      {/* Spacer so page content is never hidden behind the fixed bar */}
      <div
        aria-hidden
        className="pointer-events-none w-full"
        style={{ height: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-background/95 backdrop-blur-md"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-3 pt-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
          {signedIn ? (
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Persona</span>
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                value={personaId}
                disabled={!personasReady || starting}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next === '__manage__') {
                    router.push('/dashboard/personas');
                    return;
                  }
                  setPersonaId(next);
                  if (next) writeLastPersonaId(next);
                }}
                className={cn(
                  'h-11 w-full appearance-none truncate rounded-full border border-white/10 bg-secondary pl-9 pr-9 text-sm font-semibold',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                )}
                aria-label="Choose persona for this chat"
              >
                {!personasReady && <option value="">Loading personas…</option>}
                {personasReady && personas.length === 0 && (
                  <option value="">Default (no saved persona)</option>
                )}
                {personas.map((persona) => (
                  <option key={persona.id} value={persona.id}>
                    {persona.name}
                    {persona.isDefault ? ' · default' : ''}
                    {persona.boundCharacterIds?.includes(characterId) ? ' · bound' : ''}
                  </option>
                ))}
                <option value="__manage__">Manage / create personas…</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              {selected && (
                <span className="mt-1 block truncate px-1 text-[11px] text-muted-foreground sm:hidden">
                  Chatting as {selected.name}
                </span>
              )}
            </label>
          ) : (
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              Sign in to pick a persona and start chatting with {characterName || 'this character'}.
            </p>
          )}

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canEdit && (
              <Link
                href={`/characters/${characterId}/edit`}
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-secondary px-4 text-sm font-semibold ring-1 ring-white/10"
              >
                <Pencil className="h-4 w-4" />
                Edit Card
              </Link>
            )}
            {signedIn ? (
              <button
                type="button"
                onClick={() => void startChat()}
                disabled={starting || !personasReady}
                className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground sm:flex-none"
              >
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                {selected ? `Chat as ${selected.name}` : 'Start chat'}
              </button>
            ) : (
              <Link
                href={`/login?callbackUrl=${encodeURIComponent(`/characters/${characterId}`)}`}
                className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground sm:flex-none"
              >
                <MessageSquare className="h-4 w-4" />
                Sign in to chat
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
