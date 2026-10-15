'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Plus, Upload, Compass, UserRound, Pin, Sparkles } from 'lucide-react';
import { AppHeader } from '@/components/layout/app-header';
import { CharacterGrid } from '@/components/gallery/character-grid';
import { CharacterCard, cardAudioTrack } from '@/components/gallery/character-card';
import { FilterBar, SearchInput } from '@/components/gallery/filter-bar';
import { FantasyBanner } from '@/components/gallery/fantasy-banner';
import { ImportModal } from '@/components/character/import-modal';
import { Button } from '@/components/ui/button';
import { useAccess } from '@/components/billing/access-provider';
import { useNsfwView } from '@/lib/nsfw-view';
import { supabaseBrowser } from '@/lib/supabase/browser';

export function GalleryPage() {
  const [community, setCommunity] = useState<any[]>([]);
  const [library, setLibrary] = useState<any[]>([]);
  const [personas, setPersonas] = useState<Array<{ id: string; name: string; isDefault?: boolean }>>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const nsfwEnabled = useNsfwView();
  const [importOpen, setImportOpen] = useState(false);
  const { status: access } = useAccess();
  // 'mine' = My Characters (owned by the viewer); deep-linkable via ?view=mine.
  // Tab stays 'all' until the URL is read so the server and client markup match.
  const [view, setView] = useState<'all' | 'mine'>('all');
  const [tabReady, setTabReady] = useState(false);
  const loadSeq = useRef(0);
  const showMine = view === 'mine' && !!access?.authenticated;
  const signedIn = !!access?.authenticated;

  if (!tabReady && typeof window !== 'undefined') {
    const tab = new URLSearchParams(window.location.search).get('view') === 'mine' ? 'mine' : 'all';
    setTabReady(true);
    if (tab !== view) setView(tab);
  }

  useEffect(() => {
    function onDeleted(event: Event) {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      setLibrary((prev) => prev.filter((character) => character.id !== id));
      setCommunity((prev) => prev.filter((character) => character.id !== id));
    }
    window.addEventListener('nexus:character-deleted', onDeleted);
    return () => window.removeEventListener('nexus:character-deleted', onDeleted);
  }, []);

  function changeView(v: 'all' | 'mine') {
    setView(v);
    setSelectedTag('');
    const url = new URL(window.location.href);
    if (v === 'mine') url.searchParams.set('view', 'mine'); else url.searchParams.delete('view');
    window.history.replaceState(null, '', url.toString());
  }

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const loadFeed = useCallback(async (quiet = false, refresh = false) => {
    const seq = ++loadSeq.current;
    if (!quiet) setLoading(true);
    const params = new URLSearchParams();
    if (debounced) params.set('search', debounced);
    if (selectedTag) params.set('tag', selectedTag);
    params.set('nsfw', nsfwEnabled ? 'true' : 'false');
    const mineParams = new URLSearchParams(params);
    mineParams.set('mine', 'true');
    if (refresh) mineParams.set('refresh', '1');
    try {
      const jobs: Promise<void>[] = [
        fetch(`/api/characters?${params.toString()}`, { cache: 'no-store' })
          .then(async (res) => {
            const data = res.ok ? await res.json().catch(() => null) : null;
            if (seq !== loadSeq.current) return;
            setCommunity(Array.isArray(data) ? data : []);
          }),
      ];
      if (signedIn) {
        jobs.push(
          fetch(`/api/characters?${mineParams.toString()}`, { cache: 'no-store' })
            .then(async (res) => {
              const data = res.ok ? await res.json().catch(() => null) : null;
              if (seq !== loadSeq.current) return;
              setLibrary(Array.isArray(data) ? data : []);
            }),
          fetch(`/api/personas${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' })
            .then(async (res) => {
              const data = res.ok ? await res.json().catch(() => null) : null;
              if (seq !== loadSeq.current) return;
              setPersonas(Array.isArray(data) ? data.filter((persona) => persona && typeof persona.id === 'string' && typeof persona.name === 'string') : []);
            }),
        );
      } else if (seq === loadSeq.current) {
        setLibrary([]);
        setPersonas([]);
      }
      await Promise.all(jobs);
    } catch {
      if (seq !== loadSeq.current) return;
      setCommunity([]);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [debounced, selectedTag, nsfwEnabled, signedIn]);

  useEffect(() => {
    if (!tabReady) return;
    if (view === 'mine' && !access) return;
    void (async () => { await loadFeed(); })();
  }, [tabReady, view, access?.authenticated, access?.userId, loadFeed]);

  // Tag list comes from every visible character, independent of the active tag filter
  const loadTags = useCallback(async () => {
    try {
      const res = await fetch(`/api/characters?nsfw=${nsfwEnabled ? 'true' : 'false'}`, { cache: 'no-store' });
      const data = res.ok ? await res.json().catch(() => null) : null;
      const tags = Array.isArray(data) ? data.flatMap((c: any) => c?.tags ?? []) : [];
      setAllTags(Array.from(new Set<string>(tags)).sort());
    } catch {
      setAllTags([]);
    }
  }, [nsfwEnabled]);

  useEffect(() => {
    void (async () => { await loadTags(); })();
  }, [loadTags]);

  useEffect(() => {
    const client = supabaseBrowser();
    if (!client) return;
    const channel = client.channel('gallery-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'characters' }, () => {
        window.dispatchEvent(new Event('nexus:cloud-revision'));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personas' }, () => {
        window.dispatchEvent(new Event('nexus:cloud-revision'));
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, []);

  useEffect(() => {
    let timer = 0;
    function onRevision() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void loadFeed(true, true);
        void loadTags();
      }, 400);
    }
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      void loadFeed(true, true);
    }
    window.addEventListener('nexus:cloud-revision', onRevision);
    window.addEventListener('nexus:cloud-sync', onRevision);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('nexus:cloud-revision', onRevision);
      window.removeEventListener('nexus:cloud-sync', onRevision);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadFeed, loadTags]);

  const picks = library.filter((item) => nsfwEnabled || !item.nsfw).slice(0, 8);

  return (
    <div className="min-h-[100dvh] w-full max-w-full bg-background">
      <AppHeader
        center={<SearchInput value={search} onChange={setSearch} />}
        right={
          <>
            <Button variant="ghost" size="sm" onClick={() => setImportOpen(true)} aria-label="Import character card">
              <Upload className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Import</span>
            </Button>
            <Link href="/characters/new" aria-label="Create character">
              <Button size="sm" className="px-2 font-semibold shadow-lg shadow-primary/25 sm:px-3">
                <Plus className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Create Character</span>
              </Button>
            </Link>
          </>
        }
      />

      <FantasyBanner />

      <div
        className="sticky z-30 border-b border-border/60 bg-background/90 backdrop-blur-md"
        style={{ top: 'calc(3.5rem + max(0.5rem, env(safe-area-inset-top)))' }}
      >
        <div className="mx-auto max-w-7xl px-3 sm:px-6 py-3">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            selectedTag={selectedTag}
            onTagChange={setSelectedTag}
            allTags={allTags}
            searchInHeader
          />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-3 sm:px-6 pt-4 pb-16">
        {access?.authenticated && (
          <div role="tablist" aria-label="Character view" className="mb-4 inline-flex rounded-full bg-card p-1 ring-1 ring-white/5 shadow-md shadow-black/20">
            {([['all', 'Browse Characters', Compass], ['mine', 'My Characters', UserRound]] as const).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => changeView(v)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition-colors ${view === v ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>
        )}
        {signedIn && picks.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold tracking-tight">
              <Pin className="h-4 w-4 text-primary" /> Top 8 Picks
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {picks.map((item) => (
                <div key={item.id} className="w-56 shrink-0">
                  <CharacterCard {...item} audioUrl={cardAudioTrack(item)} canEdit={!!access?.isCreatorAdmin || item.ownerId === access?.userId} showVisibility={!!access?.isCreatorAdmin || item.ownerId === access?.userId} />
                </div>
              ))}
            </div>
          </section>
        )}
        {signedIn && (
          <section className="mb-10">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-lg font-bold tracking-tight sm:text-xl">My Created Cards</h2>
              {!loading && <span className="text-xs text-muted-foreground">{library.length} cards</span>}
            </div>
            <CharacterGrid
              characters={library}
              loading={loading && library.length === 0}
              onTagClick={setSelectedTag}
              viewerId={access?.userId}
              isAdmin={!!access?.isAdmin || !!access?.isCreatorAdmin}
              emptyTitle="No characters yet"
              emptyHint="Characters you create or import will appear here, ready to edit."
            />
            <h3 className="mb-3 mt-6 flex items-center gap-2 font-display text-base font-bold">
              <Sparkles className="h-4 w-4 text-primary" /> Personas
            </h3>
            {personas.length === 0 ? (
              <p className="text-sm text-muted-foreground">No personas yet. <Link href="/dashboard/personas" className="text-primary hover:underline">Create one</Link></p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {personas.map((persona) => (
                  <Link key={persona.id} href="/dashboard/personas" className="shrink-0 rounded-full bg-card px-3 py-1.5 text-sm font-semibold ring-1 ring-white/10">
                    {persona.name}{persona.isDefault ? ' · default' : ''}
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}
        {!showMine && (
          <section>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-lg font-bold tracking-tight sm:text-xl">
                {selectedTag ? <>Tagged <span className="text-primary">#{selectedTag}</span></> : 'Discover Characters'}
              </h2>
              {!loading && <span className="text-xs text-muted-foreground">{community.length} found</span>}
            </div>
            <CharacterGrid
              characters={community}
              loading={loading && community.length === 0}
              onTagClick={setSelectedTag}
              viewerId={access?.userId}
              isAdmin={!!access?.isAdmin || !!access?.isCreatorAdmin}
            />
          </section>
        )}
      </div>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => { void loadFeed(true, true); loadTags(); }}
      />
    </div>
  );
}
