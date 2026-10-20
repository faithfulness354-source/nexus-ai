'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AutoTextarea } from '@/components/editor/auto-textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Save, ArrowLeft, X, Plus, Download, Loader2, Eye, EyeOff, ChevronDown, ImageIcon, Eraser, Music, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { queueNovelAiSync } from '@/lib/exporters/sync-client';
import { cardFirstMessage } from '@/lib/opening';
import Link from 'next/link';
import { mediaVersionUrl } from '@/lib/media-src';
import { GalleryEditor } from './gallery-editor';
import { RoleplayText } from '@/components/chat/roleplay-text';
import { estimateTokens } from '@/lib/tokens';
import { imageForCard, uploadProfileAudio } from '@/lib/upload-client';
import type { GalleryImage } from '@/lib/types';
import { useAccess } from '@/components/billing/access-provider';
import { Lock } from 'lucide-react';
import { RichTextEditor } from '@/components/editor/rich-text-editor';
import { RichContent } from '@/components/editor/rich-content';
import { escapeHtml, looksLikeHtml, textToHtml } from '@/lib/rich-text';
import { CARD_VISIBILITIES, visibilityBadgeClass, visibilityLabel, type CardVisibility } from '@/lib/card-visibility';
import { textImpliesNsfw } from '@/lib/nsfw-notice';

interface CharacterFormProps {
  initialData?: any;
  characterId?: string;
  mode: 'create' | 'edit';
}

const SNIPPETS: { label: string; text: string }[] = [
  {
    label: 'Definition template',
    text: `[{{char}}'s Persona]\nFull name: \nAge: \nAppearance: \nPersonality: \nLikes: \nDislikes: \nSpeech style: \nBackstory: `,
  },
  {
    label: 'Lorebook entry',
    text: `[Lorebook: <Place / Faction / Item>]\nKeywords: \nDescription: `,
  },
  {
    label: 'Anti-godmoding rules',
    text: `[Rules]\n- Never speak, act, think or decide for {{user}}; only write {{char}}'s actions, dialogue and the world's reactions.\n- End each reply at a natural point that leaves {{user}} room to respond.\n- Keep {{char}} in character at all times.`,
  },
];

function Section({ title, hint, tokens, children, right }: { title: string; hint?: string; tokens?: number; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card p-4 sm:p-5 shadow-lg shadow-black/20 ring-1 ring-white/5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="nexus-heading text-xl sm:text-2xl">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="flex items-center gap-2">
          {right}
          {tokens !== undefined && <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-mono text-muted-foreground">{tokens} tokens</span>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** localStorage key for the unsaved "Create Character" draft. */
const DRAFT_KEY = 'nexus:character-draft:v1';

/** Tags are stored as a comma-separated string and sometimes arrive as JSON. */
function parseStoredTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim().replace(/^#+/, '')).filter(Boolean);
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parseStoredTags(parsed);
    } catch { /* fall through to a comma list */ }
  }
  return trimmed.split(',').map((tag) => tag.trim().replace(/^#+/, '')).filter(Boolean);
}

function initialForm(initialData?: any) {
  return {
    name: initialData?.name ?? '',
    title: initialData?.title ?? '',
    summary: initialData?.summary ?? initialData?.description ?? '',
    personality: initialData?.personality ?? '',
    scenario: initialData?.scenario ?? '',
    initialMessage: cardFirstMessage(initialData),
    exampleDialogue: initialData?.exampleDialogue ?? '',
    customRules: initialData?.customRules ?? '{"meters":[],"rules":[]}',
    systemPrompt: initialData?.systemPrompt ?? initialData?.system_prompt ?? '',
    creatorNotes: initialData?.creatorNotes ?? '',
    tags: parseStoredTags(initialData?.tags),
    avatar: initialData?.avatar ?? '',
    audioUrl: initialData?.audioUrl ?? initialData?.audio ?? '',
    banner: initialData?.banner ?? '',
    creator: initialData?.creator ?? '',
    nsfw: (initialData?.nsfw ?? false) as boolean,
    visibility: (initialData?.visibility === 'PUBLIC' || initialData?.visibility === 'UNLISTED' ? initialData.visibility : 'PRIVATE') as CardVisibility,
    moderated: (initialData?.moderated ?? false) as boolean,
    sceneImages: (initialData?.sceneImages ?? true) as boolean,
    gallery: (Array.isArray(initialData?.gallery)
      ? initialData.gallery
      : typeof initialData?.gallery === 'string'
        ? (() => { try { const parsed = JSON.parse(initialData.gallery); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })()
        : []) as GalleryImage[],
  };
}
type CharacterFormState = ReturnType<typeof initialForm>;
type FormKey = keyof CharacterFormState;

/** True when the user has entered anything worth keeping. */
function hasContent(f: CharacterFormState): boolean {
  const empty = initialForm(undefined);
  return (Object.keys(empty) as FormKey[]).some((k) => {
    if (k === 'nsfw') return false;
    const v = f[k];
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string') return v.replace(/<[^>]*>/g, '').trim() !== '' && v !== empty[k];
    return v !== empty[k];
  });
}

/** Writes the create-character draft immediately. An empty form is left untouched so a late render cannot erase it. */
function saveDraft(form: CharacterFormState) {
  try {
    if (!hasContent(form)) return;
    const { nsfw: _nsfw, ...draft } = form;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch (err) {
    console.error('Failed to save character draft:', err);
  }
}
export function CharacterForm({ initialData, characterId, mode }: CharacterFormProps) {
  const router = useRouter();
  const avatarInput = useRef<HTMLInputElement>(null);
  const tagField = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioStatus, setAudioStatus] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [previewGreeting, setPreviewGreeting] = useState(false);
  const [previewBio, setPreviewBio] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { status: access, openPaywall, requestNsfw } = useAccess();
  // Custom system prompts & lorebooks are Plus+ (the server drops the system prompt otherwise).
  const canCustom = !!access?.can.customPrompts;

  const [form, setForm] = useState(() => initialForm(initialData));
  const formRef = useRef(form);
  formRef.current = form;
  const dirtyRef = useRef(false);
  // Draft persistence (create mode only): restore once on mount, then auto-save on every change.
  const isCreate = mode === 'create';
  const loadedId = initialData?.id as string | undefined;
  // Hydrate once per card. A later parent render must not wipe an audio path the user just chose.
  const hydratedId = useRef<string | undefined>(loadedId);

  // Edit pages can pass the record after the first render. Copy every saved field into the inputs.
  useEffect(() => {
    if (isCreate || !initialData || !loadedId) return;
    if (hydratedId.current === loadedId) return;
    hydratedId.current = loadedId;
    setForm(initialForm(initialData));
  }, [isCreate, loadedId, initialData]);

  useEffect(() => {
    if (isCreate || initialData || !characterId) return;
    let cancelled = false;
    fetch(`/api/characters/${characterId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data && !data.error) setForm(initialForm(data));
      })
      .catch((err) => console.error('Failed to load character for editing:', err));
    return () => { cancelled = true; };
  }, [isCreate, characterId, initialData]);
  const [draftReady, setDraftReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (isCreate) return;
    const id = characterId || loadedId;
    if (!id) return;
    function onRevision() {
      if (dirtyRef.current) return;
      fetch(`/api/characters/${id}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (data && !data.error && !dirtyRef.current) setForm(initialForm(data));
        })
        .catch(() => {});
    }
    window.addEventListener('nexus:cloud-revision', onRevision);
    return () => window.removeEventListener('nexus:cloud-revision', onRevision);
  }, [isCreate, characterId, loadedId]);

  useEffect(() => {
    if (!isCreate) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved === 'object') {
        const restored = initialForm(undefined);
        for (const k of Object.keys(restored) as FormKey[]) {
          // NSFW always starts OFF (age gate) and is never restored from a draft.
          if (k === 'nsfw' || saved[k] === undefined) continue;
          const sameType = Array.isArray(restored[k]) ? Array.isArray(saved[k]) : typeof saved[k] === typeof restored[k];
          if (sameType) (restored as any)[k] = saved[k];
        }
        if (hasContent(restored)) {
          formRef.current = restored;
          setForm(restored);
          setDirty(true);
          toast.info('Restored your unsaved character draft.');
        }
      }
    } catch (err) {
      console.error('Failed to restore character draft:', err);
    }
    setDraftReady(true);
  }, [isCreate]);

  useEffect(() => {
    if (!isCreate || !draftReady) return;
    saveDraft(form);
  }, [form, isCreate, draftReady]);

  // Leaving the page (back button, app switch) must keep the draft even if React unmounts first.
  useEffect(() => {
    if (!isCreate) return;
    const flush = () => saveDraft(formRef.current);
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [isCreate]);

  // Browser confirmation on refresh / tab close while there are unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
  }

  function handleClearForm() {
    if (hasContent(form) && !window.confirm('Clear all fields? Your saved draft will be deleted.')) return;
    clearDraft();
    const empty = initialForm(undefined);
    formRef.current = empty;
    setForm(empty);
    setTagInput('');
    setDirty(false);
    toast.success('Form cleared');
  }

  function updateField<K extends FormKey>(key: K, value: CharacterFormState[K]) {
    const next = { ...formRef.current, [key]: value };
    formRef.current = next;
    if (isCreate) saveDraft(next);
    setForm(next);
    setDirty(true);
  }

  const autoNsfw = textImpliesNsfw(
    form.name, form.title, form.summary, form.personality, form.scenario, form.initialMessage,
    form.exampleDialogue, form.creatorNotes, form.systemPrompt, form.tags, form.gallery,
  );
  useEffect(() => {
    if (autoNsfw && !formRef.current.nsfw) updateField('nsfw', true);
  }, [autoNsfw]);

  function insertSnippet(text: string) {
    // The definition is rich text (HTML); append the snippet as escaped paragraphs.
    const cur = form.personality.trim();
    const base = cur && !looksLikeHtml(cur) ? textToHtml(cur) : cur;
    const snippet = `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
    updateField('personality', base + snippet);
  }

  /** Merges comma-separated input into the tag list (trimmed, '#'-stripped, case-insensitive dedupe). */
  function mergeTags(current: string[], raw: string): string[] {
    const next = [...current];
    for (const part of raw.split(',')) {
      const tag = part.trim().replace(/^#+/, '').slice(0, 40);
      if (tag && !next.some((t) => t.toLowerCase() === tag.toLowerCase())) next.push(tag);
    }
    return next;
  }

  function addTag() {
    if (!tagInput.trim()) return;
    updateField('tags', mergeTags(form.tags, tagInput));
    setTagInput('');
  }

  function removeTag(tag: string) {
    updateField('tags', form.tags.filter((t) => t !== tag));
  }

  /** Click a tag to edit it: it moves back into the input (committing whatever was typed first). */
  function editTag(tag: string) {
    const rest = form.tags.filter((t) => t !== tag);
    updateField('tags', tagInput.trim() ? mergeTags(rest, tagInput) : rest);
    setTagInput(tag);
    requestAnimationFrame(() => tagField.current?.focus());
  }

  function handleTagKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && !tagInput && form.tags.length) {
      editTag(form.tags[form.tags.length - 1]);
      e.preventDefault();
    }
  }

  async function handleAudioFile(file?: File) {
    if (!file) return;
    setAudioUploading(true);
    setAudioStatus(`Attaching ${file.name || 'audio'}…`);
    try {
      const data = await uploadProfileAudio(file);
      updateField('audioUrl', data.url);
      if (mode === 'edit' && initialData?.id) {
        const save = await fetch(`/api/characters/${initialData.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioUrl: data.url }),
        });
        const saved = await save.json().catch(() => ({}));
        if (!save.ok) throw new Error(saved?.error ?? 'Could not save the audio on this card');
      }
      setAudioStatus(`Attached: ${file.name || 'audio'}`);
      toast.success('Card audio attached');
    } catch (err: any) {
      console.error('Audio upload failed:', err);
      setAudioStatus('');
      toast.error(err?.message ?? 'Could not attach that audio');
    } finally {
      setAudioUploading(false);
    }
  }

  async function handleAvatarFile(file?: File) {
    if (!file) return;
    setAvatarUploading(true);
    try {
      const up = await imageForCard(file, 'avatar');
      updateField('avatar', up.url);
      updateField('banner', up.url);
      toast.success('Main card image saved');
    } catch (err: any) {
      console.error('Avatar upload failed:', err);
      toast.error(err?.message ?? 'Upload failed');
    } finally {
      setAvatarUploading(false);
      if (avatarInput.current) avatarInput.current.value = '';
    }
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      toast.error('Character name is required');
      return;
    }
    if (audioUploading || avatarUploading) {
      toast.error('Wait for the upload to finish, then save');
      return;
    }
    setLoading(true);
    try {
      const url = mode === 'edit' ? `/api/characters/${initialData?.id}` : '/api/characters';
      const res = await fetch(url, {
        method: mode === 'edit' ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        // A typed-but-not-yet-added tag is saved too, so nothing in the input is lost.
        body: JSON.stringify({
          ...form,
          firstMessage: form.initialMessage,
          tags: mergeTags(form.tags, tagInput),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? 'Save failed');
      }
      const saved = await res.json();
      if (!saved?.id) throw new Error('Save did not return the character');
      // Draft is only discarded after the server confirms the save.
      if (isCreate) clearDraft();
      setDirty(false);
      toast.success(mode === 'edit' ? 'Character updated!' : 'Character created!');
      queueNovelAiSync('character', saved.id);
      window.dispatchEvent(new Event('nexus:cloud-revision'));
      router.push(`/characters/${saved.id}/chat`);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteCharacter() {
    const character = initialData;
    const id = character?.id;
    if (mode !== 'edit' || !id) return;
    if (!window.confirm('Are you sure you want to delete this character?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/characters/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? 'Delete failed');
      }
      window.dispatchEvent(new CustomEvent('nexus:character-deleted', { detail: { id } }));
      toast.success('Character deleted');
      router.refresh();
      router.push('/');
    } catch (err: any) {
      toast.error(err?.message ?? 'Delete failed');
      setDeleting(false);
    }
  }

  async function handleExport() {
    if (!initialData?.id) return;
    try {
      const res = await fetch(`/api/characters/${initialData.id}/export`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form.name || 'character'}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Character exported!');
    } catch {
      toast.error('Failed to export');
    }
  }

  const definitionTokens = estimateTokens(form.personality);
  const totalTokens = estimateTokens([form.personality, form.scenario, form.exampleDialogue, form.systemPrompt].join('\n'));

  return (
    <div
      className="max-w-3xl mx-auto py-6 sm:py-8 px-4"
      style={{ paddingBottom: mode === 'edit' ? 'calc(env(safe-area-inset-bottom, 0px) + 7.5rem)' : '6rem' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon-sm" asChild aria-label="Back">
            <Link href="/"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <h1 className="nexus-heading text-3xl sm:text-4xl truncate">
            {mode === 'edit' ? 'Edit Character' : 'Create Character'}
          </h1>
        </div>
        <div className="flex gap-2 shrink-0">
          {isCreate && (
            <Button variant="outline" size="sm" onClick={handleClearForm} aria-label="Clear form">
              <Eraser className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Clear Form</span>
            </Button>
          )}
          {mode === 'edit' && (
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Export</span>
            </Button>
          )}
          <Button onClick={handleSubmit} loading={loading}>
            <Save className="h-4 w-4 mr-1" />
            {mode === 'edit' ? 'Save Changes' : 'Create'}
          </Button>
        </div>
      </div>

      <section className="mb-5 rounded-2xl bg-card p-4 sm:p-5 shadow-lg shadow-black/20 ring-1 ring-white/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-sm font-semibold tracking-wide">Publish</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">New cards stay private. Browse, search, and other people only see a card after you publish it.</p>
          </div>
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${visibilityBadgeClass(form.visibility, form.moderated)}`}>
            {visibilityLabel(form.visibility, form.moderated)}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-secondary/50 px-3 py-2">
          <div>
            <p className="text-sm font-medium">Public</p>
            <p className="text-[11px] text-muted-foreground">Show this card in browse and search</p>
          </div>
          <Switch
            checked={form.visibility === 'PUBLIC'}
            onCheckedChange={(on) => updateField('visibility', on ? 'PUBLIC' : 'PRIVATE')}
            aria-label="Publish card"
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {CARD_VISIBILITIES.map((state) => (
            <button
              key={state}
              type="button"
              onClick={() => updateField('visibility', state)}
              className={`rounded-xl px-2 py-2 text-xs font-semibold ring-1 transition ${form.visibility === state ? 'bg-primary text-primary-foreground ring-primary' : 'bg-background text-muted-foreground ring-white/10 hover:text-foreground'}`}
            >
              {state === 'PRIVATE' ? 'Private' : state === 'PUBLIC' ? 'Public' : 'Unlisted'}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {form.visibility === 'PUBLIC' && 'Published. Anyone can find this card.'}
          {form.visibility === 'UNLISTED' && 'Hidden from browse and search. Anyone with the link can open it.'}
          {form.visibility === 'PRIVATE' && 'Draft. Only you can see this card.'}
        </p>
        {form.moderated && (
          <p className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">This card is disabled by moderation, so it stays hidden even if the visibility is public.</p>
        )}
        {mode === 'edit' && access?.isCreatorAdmin && (
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/5 pt-3">
            <div>
              <p className="text-sm font-medium">Disabled / Moderated</p>
              <p className="text-[11px] text-muted-foreground">Creator admin takedown. Removes the card from the public site.</p>
            </div>
            <Switch checked={form.moderated} onCheckedChange={(on) => updateField('moderated', on)} aria-label="Disable card" />
          </div>
        )}
      </section>

      <div className="space-y-5">
        {/* Identity: avatar + name + title */}
        <section className="rounded-2xl bg-card p-4 sm:p-5 shadow-lg shadow-black/20 ring-1 ring-white/5">
          <div className="space-y-4">
            <div>
              <Label htmlFor="main-card-image">Main Card Image</Label>
              <button
                id="main-card-image"
                type="button"
                onClick={() => avatarInput.current?.click()}
                className="group relative mt-2 flex h-44 w-44 items-center justify-center overflow-hidden rounded-xl bg-secondary ring-1 ring-white/10"
                aria-label="Upload main card image"
              >
                {form.avatar ? (
                  <img key={form.avatar} src={mediaVersionUrl(form.avatar)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {avatarUploading ? <Loader2 className="h-6 w-6 animate-spin" /> : 'Upload'}
                </span>
              </button>
              <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => handleAvatarFile(e.target.files?.[0])} />
              <p className="mt-1 text-[11px] text-muted-foreground">{avatarUploading ? 'Uploading…' : 'Choose a picture from this device. It is saved as this card’s image.'}</p>
            </div>
            <div className="space-y-3 min-w-0">
              <div>
                <Label>Character Name *</Label>
                <Input value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="e.g. Luna Starweaver" className="mt-1 text-base font-semibold" />
              </div>
              <div>
                <Label>Title / Tagline</Label>
                <Input value={form.title} onChange={(e) => updateField('title', e.target.value)} placeholder="e.g. The exiled moon-priestess who owes you a debt" className="mt-1" />
              </div>
              <div>
                <Label>Creator</Label>
                <Input value={form.creator} onChange={(e) => updateField('creator', e.target.value)} placeholder="Your handle" className="mt-1" />
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <Label htmlFor="audio-url" className="inline-flex items-center gap-1.5"><Music className="h-3.5 w-3.5" /> Background audio</Label>
            <Input
              id="audio-url"
              value={form.audioUrl}
              onChange={(e) => { setAudioStatus(''); updateField('audioUrl', e.target.value); }}
              placeholder="https://… or /nexus_assets/audio/filename.mp3"
            />
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm,.flac"
              disabled={audioUploading}
              aria-label="Choose card audio file"
              className="block w-full cursor-pointer text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-semibold"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleAudioFile(file);
              }}
            />
            <p className="text-[11px] text-muted-foreground">{audioUploading ? audioStatus || 'Attaching audio…' : audioStatus || (form.audioUrl ? 'Audio attached' : 'Choose an mp3, wav, ogg, m4a, or flac from this device.')}</p>
          </div>
        </section>

        <Section
          title="Character Bio / Card Description"
          hint="Shown on the character card and bio. Supports rich formatting and Markdown. Not sent to the AI."
          right={
            <button type="button" onClick={() => setPreviewBio((v) => !v)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              {previewBio ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {previewBio ? 'Edit' : 'Preview'}
            </button>
          }
        >
          {previewBio ? (
            <div className="min-h-[140px] rounded-xl bg-background p-4 ring-1 ring-border">
              {form.summary.trim() ? <RichContent content={form.summary} className="text-sm" /> : <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>}
            </div>
          ) : (
            <RichTextEditor ariaLabel="Character bio" value={form.summary} onChange={(v) => updateField('summary', v)} placeholder="Who is this character and what kind of story do they offer?" minHeight={120} />
          )}
        </Section>

        <Section title="Public Description" hint="Extra public notes for readers: lore links, galleries, credits, content notes. Not sent to the AI.">
          <RichTextEditor ariaLabel="Public description" value={form.creatorNotes} onChange={(v) => updateField('creatorNotes', v)} placeholder="Lore pages, art credits, creator profile, content notes..." minHeight={120} />
        </Section>

        <Section
          title="Personality / Character Definition"
          hint="The core definition sent to the AI: persona, system instructions, lorebook entries and rules. Use {{char}} and {{user}}."
          tokens={definitionTokens}
        >
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SNIPPETS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => (s.label === 'Lorebook entry' && !canCustom ? openPaywall('customPrompts') : insertSnippet(s.text))} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-primary/20 transition-colors">
                {s.label === 'Lorebook entry' && !canCustom ? <Lock className="h-3 w-3" /> : <Plus className="h-3 w-3" />}{s.label}
              </button>
            ))}
          </div>
          <RichTextEditor ariaLabel="Character definition" value={form.personality} onChange={(v) => updateField('personality', v)} placeholder={"[{{char}}'s Persona]\nPersonality: ..."} minHeight={240} />
          <p className="mt-1.5 text-[11px] text-muted-foreground">Formatting is for readability only; it's stripped to plain text before being sent to the AI, so it costs no extra tokens.</p>
        </Section>

        <Section title="Scenario" hint="The world, setting and current situation." tokens={estimateTokens(form.scenario)}>
          <AutoTextarea value={form.scenario} onChange={(e) => updateField('scenario', e.target.value)} placeholder="The year is 1203 of the Ember Age. {{user}} wakes in the ruined observatory..." />
        </Section>

        <Section
          title="First Message"
          hint='The greeting that opens every chat. Use *asterisks* for actions and "quotes" for dialogue.'
          tokens={estimateTokens(form.initialMessage)}
          right={
            <button type="button" onClick={() => setPreviewGreeting((v) => !v)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              {previewGreeting ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {previewGreeting ? 'Edit' : 'Preview'}
            </button>
          }
        >
          {previewGreeting ? (
            <div className="min-h-[140px] rounded-xl bg-background p-4 ring-1 ring-border">
              {form.initialMessage.trim() ? <RoleplayText content={form.initialMessage} /> : <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>}
            </div>
          ) : (
            <AutoTextarea value={form.initialMessage} onChange={(e) => updateField('initialMessage', e.target.value)} placeholder={'*She looks up from the star charts, eyes glinting.* "You\'re late, traveler."'} minHeight={150} />
          )}
        </Section>

        <Section title="Example Dialogues" hint="Sample exchanges that teach the AI the character's voice." tokens={estimateTokens(form.exampleDialogue)}>
          <AutoTextarea value={form.exampleDialogue} onChange={(e) => updateField('exampleDialogue', e.target.value)} placeholder={'<START>\n{{user}}: Who are you?\n{{char}}: *tilts her head* "Someone who remembers the stars."'} minHeight={150} className="font-mono text-[13px]" />
        </Section>

        <Section
          title="Character Gallery"
          hint="Reference portraits, outfits and expressions. The scene-image switch lets Ultimate chats render a picture here (100 image credits a day). Other plans keep the gallery, but the render button stays locked."
          right={
            <div className="flex items-center gap-2">
              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Scene images</span>
              <Switch checked={form.sceneImages} onCheckedChange={(v: boolean) => updateField('sceneImages', v)} aria-label="Enable scene image generation" />
            </div>
          }
        >
          <GalleryEditor value={form.gallery} onChange={(g) => updateField('gallery', g)} characterName={form.name} onUseAsAvatar={(url) => { updateField('avatar', url); updateField('banner', url); }} />
        </Section>

        <Section title="Tags" hint="Help people find your character, e.g. fantasy, romance, sfw. Press Enter, comma or + to add; click a tag to edit it.">
          <div className="flex gap-1">
            <Input ref={tagField} value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Add tag..." onKeyDown={handleTagKey} aria-label="New tag" />
            <Button type="button" variant="secondary" onClick={addTag} aria-label="Add tag"><Plus className="h-4 w-4" /></Button>
          </div>
          {form.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(form.tags || []).map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                  <button type="button" onClick={() => editTag(tag)} title="Click to edit" aria-label={`Edit tag ${tag}`} className="hover:text-primary">#{tag}</button>
                  <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove ${tag}`} className="rounded-full p-0.5 hover:bg-destructive/30 hover:text-destructive-foreground"><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Switch checked={form.nsfw || autoNsfw} disabled={autoNsfw} onCheckedChange={async (v: boolean) => { if (!v && autoNsfw) return; updateField('nsfw', v ? await requestNsfw() : false); }} />
            <Label>NSFW content</Label>
            {autoNsfw && <p className="w-full text-xs text-rose-300">NSFW notice added because this card mentions nudity, underwear, or lingerie.</p>}
          </div>
        </Section>

        {/* Advanced */}
        <section className="rounded-2xl bg-card shadow-lg shadow-black/20 ring-1 ring-white/5">
          <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="w-full flex items-center justify-between p-4 sm:p-5 text-left">
            <div>
              <h2 className="font-display text-sm font-semibold tracking-wide">Advanced</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">System prompt override, status meters and creator notes.</p>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>
          {showAdvanced && (
            <div className="space-y-4 px-4 sm:px-5 pb-5">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Label>System Prompt</Label>
                  {!canCustom && (
                    <button type="button" onClick={() => openPaywall('customPrompts')} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                      <Lock className="h-3 w-3" /> Plus feature
                    </button>
                  )}
                </div>
                <Textarea disabled={!canCustom} value={form.systemPrompt} onChange={(e) => updateField('systemPrompt', e.target.value)} placeholder="Extra system-level instructions placed before the definition..." rows={4} className="mt-1" />
              </div>
              <div>
                <Label>Status Meters / Custom Rules (JSON)</Label>
                <Textarea value={form.customRules} onChange={(e) => updateField('customRules', e.target.value)} placeholder='{"meters":[{"name":"Trust","min":0,"max":10,"default":3}],"rules":[]}' rows={3} className="mt-1 font-mono text-xs" />
              </div>
            </div>
          )}
        </section>

        <p className="text-center text-xs text-muted-foreground">Permanent tokens (definition + scenario + examples): <span className="font-mono">{totalTokens}</span></p>

        {mode === 'edit' && initialData?.id && (
          <div
            className="fixed bottom-0 inset-x-0 z-30 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-background/95 px-4 pt-3 backdrop-blur"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
          >
            <Button type="button" variant="ghost" asChild>
              <Link href="/">Cancel</Link>
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-red-500/60 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                onClick={handleDeleteCharacter}
                disabled={deleting || loading}
              >
                {deleting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                Delete Character
              </Button>
              <Button type="button" onClick={handleSubmit} loading={loading} disabled={deleting}>
                <Save className="h-4 w-4 mr-1" />
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
