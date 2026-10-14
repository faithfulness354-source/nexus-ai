'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Plus, Upload, Compass, UserRound } from 'lucide-react';
import { AppHeader } from '@/components/layout/app-header';
import { CharacterGrid } from '@/components/gallery/character-grid';
import { FilterBar, SearchInput } from '@/components/gallery/filter-bar';
import { FantasyBanner } from '@/components/gallery/fantasy-banner';
import { ImportModal } from '@/components/character/import-modal';
import { Button } from '@/components/ui/button';
import { useAccess } from '@/components/billing/access-provider';

export function GalleryPage() {
  const [characters, setCharacters] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  // Always starts OFF (never restored); enabling goes through the age gate + subscriber check.
  const [nsfwEnabled, setNsfwEnabled] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { status: access, requestNsfw } = useAccess();
  // 'mine' = My Characters (owned by the viewer); deep-linkable via ?view=mine.
  // Tab stays 'all' until the URL is read so the server and client markup match.
  const [view, setView] = useState<'all' | 'mine'>('all');
  const [tabReady, setTabReady] = useState(false);
  const loadSeq = useRef(0);
  const showMine = view === 'mine' && !!access?.authenticated;

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('view') === 'mine' ? 'mine' : 'all';
    setView(tab);
    setTabReady(true);
  }, []);

  useEffect(() => {
    function onDeleted(event: Event) {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      setCharacters((prev) => prev.filter((character) => character.id !== id));
    }
    window.addEventListener('nexus:character-deleted', onDeleted);
    return () => window.removeEventListener('nexus:character-deleted', onDeleted);
  }, []);

  function changeView(v: 'all' | 'mine') {
    loadSeq.current += 1;
    setCharacters([]);
    setLoading(true);
    setView(v);
    setSelectedTag('');
    const url = new URL(window.location.href);
    if (v === 'mine') url.searchParams.set('view', 'mine'); else url.searchParams.delete('view');
    window.history.replaceState(null, '', url.toString());
  }

  // Drop back to SFW if the viewer loses entitlement (sign-out, downgrade).
  useEffect(() => {
    if (access && !access.can.nsfw) setNsfwEnabled(false);
  }, [access]);

  async function handleNsfwToggle(v: boolean) {
    setSelectedTag('');
    if (!v) return setNsfwEnabled(false);
    setNsfwEnabled(await requestNsfw());
  }

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const loadCharacters = useCallback(async (tab: 'all' | 'mine') => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debounced) params.set('search', debounced);
      if (selectedTag) params.set('tag', selectedTag);
      params.set('nsfw', nsfwEnabled ? 'true' : 'false');
      if (tab === 'mine') params.set('mine', 'true');
      const res = await fetch(`/api/characters?${params.toString()}`, { cache: 'no-store' });
      const data = res.ok ? await res.json().catch(() => null) : null;
      // A slower browse response must not replace the full owned list.
      if (seq !== loadSeq.current) return;
      setCharacters(Array.isArray(data) ? data : []);
    } catch {
      if (seq !== loadSeq.current) return;
      setCharacters([]);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [debounced, selectedTag, nsfwEnabled]);

  useEffect(() => {
    if (!tabReady) return;
    // My Characters waits for the signed-in user so the public list cannot paint first and stick.
    if (view === 'mine' && !access) return;
    const tab = view === 'mine' && access?.authenticated ? 'mine' : 'all';
    void loadCharacters(tab);
  }, [tabReady, view, access, access?.authenticated, access?.username, access?.userId, loadCharacters]);

  // Tag list comes from every visible character, independent of the active tag filter
  const loadTags = useCallback(async () => {
    try {
      const res = await fetch(`/api/characters?nsfw=${nsfwEnabled ? 'true' : 'false'}`);
      const data = res.ok ? await res.json().catch(() => null) : null;
      const tags = Array.isArray(data) ? data.flatMap((c: any) => c?.tags ?? []) : [];
      setAllTags(Array.from(new Set<string>(tags)).sort());
    } catch {
      setAllTags([]);
    }
  }, [nsfwEnabled]);

  useEffect(() => { loadTags(); }, [loadTags]);

  useEffect(() => {
    function onRevision() {
      const tab = view === 'mine' && access?.authenticated ? 'mine' : 'all';
      void loadCharacters(tab);
      void loadTags();
    }
    window.addEventListener('nexus:cloud-revision', onRevision);
    return () => window.removeEventListener('nexus:cloud-revision', onRevision);
  }, [view, access?.authenticated, loadCharacters, loadTags]);

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
              <Button size="sm" className="font-semibold shadow-lg shadow-primary/25">
                <Plus className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Create Character</span>
                <span className="sm:hidden">Create</span>
              </Button>
            </Link>
          </>
        }
      />

      <FantasyBanner />

      <div className="sticky top-14 z-30 bg-background/90 backdrop-blur-md border-b border-border/60">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 py-3">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            selectedTag={selectedTag}
            onTagChange={setSelectedTag}
            nsfwEnabled={nsfwEnabled}
            onNsfwToggle={handleNsfwToggle}
            showNsfwToggle={view !== 'mine'}
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
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display font-bold text-lg sm:text-xl tracking-tight">
            {selectedTag ? <>Tagged <span className="text-primary">#{selectedTag}</span></> : showMine ? 'My Characters' : 'Discover Characters'}
          </h2>
          {!loading && <span className="text-xs text-muted-foreground">{characters.length} found</span>}
        </div>
        <CharacterGrid
          characters={characters}
          loading={loading}
          onTagClick={setSelectedTag}
          viewerId={access?.userId}
          isAdmin={!!access?.isAdmin || !!access?.isCreatorAdmin}
          emptyTitle={showMine ? 'No characters yet' : undefined}
          emptyHint={showMine ? 'Characters you create or import will appear here, ready to edit.' : undefined}
        />
      </div>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => { void loadCharacters(showMine ? 'mine' : 'all'); loadTags(); }}
      />
    </div>
  );
}
