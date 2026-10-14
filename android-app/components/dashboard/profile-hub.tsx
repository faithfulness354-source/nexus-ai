'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Save, ExternalLink, Check, Pin, AtSign, Lock, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RichTextEditor } from '@/components/editor/rich-text-editor';
import { CharacterAvatar } from '@/components/character/character-avatar';
import { ImageField } from './image-field';
import { PublicProfile, type ProfileCharacter } from '@/components/profile/public-profile';
import { ACCENT_THEMES, USERNAME_RE, type AccentTheme, type ProfileBadge } from '@/lib/profile';
import { cn } from '@/lib/utils';
import { useAccess } from '@/components/billing/access-provider';

interface ProfileState {
  username: string | null;
  displayName: string | null;
  image: string | null;
  bio: string;
  banner: string | null;
  bannerAnimated: boolean;
  bannerPositionY: number;
  accentTheme: string;
  pinnedCharacterIds: string[];
  stats: { characters: number; loreEntries: number; lorebooks: number; personas: number; chats: number };
  badges: ProfileBadge[];
  vipThemes: boolean;
  characters: ProfileCharacter[];
}

const MAX_PINS = 6;

export function ProfileHub() {
  const { refresh: refreshAccess } = useAccess();
  const [p, setP] = useState<ProfileState | null>(null);
  const [saving, setSaving] = useState(false);
  const [songUploading, setSongUploading] = useState(false);
  const [profileSongUrl, setProfileSongUrl] = useState('');
  const [savedUsername, setSavedUsername] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/profile')
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); return d; })
      .then((d) => { setP(d); setSavedUsername(d.username); setProfileSongUrl(typeof d.profileSongUrl === 'string' ? d.profileSongUrl : ''); })
      .catch((err) => { console.error(err); toast.error(err?.message ?? 'Failed to load profile'); });
  }, []);

  if (!p) return <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const username = (p.username ?? '').toLowerCase();
  const usernameInvalid = !!username && !USERNAME_RE.test(username);
  const set = (patch: Partial<ProfileState>) => setP({ ...p, ...patch });
  const togglePin = (id: string) => {
    const on = p.pinnedCharacterIds.includes(id);
    if (!on && p.pinnedCharacterIds.length >= MAX_PINS) return toast.error(`You can pin up to ${MAX_PINS} characters`);
    set({ pinnedCharacterIds: on ? p.pinnedCharacterIds.filter((x) => x !== id) : [...p.pinnedCharacterIds, id] });
  };

  // Avatar uploads are persisted right away so the header avatar updates without a full save.
  async function changeAvatar(image: string | null) {
    set({ image });
    try {
      const r = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? 'Failed to save avatar');
      await refreshAccess();
    } catch (err: any) {
      console.error('Avatar save failed:', err);
      toast.error(err?.message ?? 'Failed to save avatar');
    }
  }

  async function uploadSong(file?: File) {
    if (!file) return;
    setSongUploading(true);
    try {
      const body = new FormData();
      body.set('file', file);
      const uploaded = await fetch('/api/upload/audio', { method: 'POST', body });
      const payload = await uploaded.json().catch(() => ({}));
      if (!uploaded.ok || typeof payload.url !== 'string') throw new Error(payload.error || 'Choose an audio file');
      const saved = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileSongUrl: payload.url }),
      });
      const data = await saved.json().catch(() => ({}));
      if (!saved.ok) throw new Error(data.error || 'Could not save the song');
      setProfileSongUrl(payload.url);
      toast.success('Profile song updated');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not upload that song');
    } finally {
      setSongUploading(false);
    }
  }

  async function save() {
    if (!p) return;
    if (usernameInvalid) return toast.error('Usernames are 3–24 characters: letters, numbers and underscores.');
    setSaving(true);
    try {
      const r = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username, displayName: p.displayName, image: p.image, bio: p.bio, banner: p.banner,
          bannerAnimated: p.bannerAnimated, bannerPositionY: p.bannerPositionY, accentTheme: p.accentTheme, pinnedCharacterIds: p.pinnedCharacterIds,
          profileSongUrl,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? 'Failed to save profile');
      setP(d);
      setSavedUsername(d.username);
      void refreshAccess();
      toast.success('Profile saved');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  const pinned = p.pinnedCharacterIds.map((id) => p.characters.find((c) => c.id === id)).filter(Boolean) as ProfileCharacter[];

  return (
    <section className="flex flex-col gap-6 lg:grid lg:grid-cols-2">
      <div className="order-1 min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Live preview</p>
        <div className="rounded-2xl bg-background ring-1 ring-white/10 pb-6">
          <PublicProfile compact profile={{ ...p, username: username || null }} pinned={pinned} creations={p.characters} />
        </div>
      </div>

      <div className="order-2 flex flex-wrap items-end justify-between gap-3 lg:col-start-1">
        <div>
          <h2 className="font-display text-xl font-bold">Profile Customization</h2>
          <p className="text-sm text-muted-foreground">Design the public page other users see when they visit you.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" asChild>
            <Link href="/dashboard/profiles">All profiles</Link>
          </Button>
          {savedUsername && (
            <Button variant="secondary" asChild>
              <Link href={`/u/${savedUsername}`} target="_blank"><ExternalLink className="h-4 w-4 mr-1" /> View public page</Link>
            </Button>
          )}
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Save profile</Button>
        </div>
      </div>

      <div className="order-3 min-w-0 space-y-5 lg:col-start-1">
          <div className="rounded-2xl bg-card p-5 ring-1 ring-white/5 space-y-4">
            <div className="flex gap-4 items-start">
              <ImageField value={p.image} onChange={(image) => void changeAvatar(image)} label="Profile avatar" />
              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <Label htmlFor="pf-user">Username</Label>
                  <div className="relative">
                    <AtSign className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="pf-user" className={cn('pl-8', usernameInvalid && 'ring-1 ring-destructive')} value={p.username ?? ''} maxLength={24}
                      onChange={(e) => set({ username: e.target.value.replace(/\s/g, '') })} placeholder="your_handle" />
                  </div>
                  <p className={cn('mt-1 text-[11px]', usernameInvalid ? 'text-destructive' : 'text-muted-foreground')}>
                    {usernameInvalid ? '3–24 characters: letters, numbers, underscores.' : username ? `Public page: /u/${username}` : 'Set a username to get a public page.'}
                  </p>
                </div>
                <div>
                  <Label htmlFor="pf-name">Display name</Label>
                  <Input id="pf-name" value={p.displayName ?? ''} maxLength={60} onChange={(e) => set({ displayName: e.target.value })} placeholder="How your name appears" />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-card p-5 ring-1 ring-white/5 space-y-4">
            <Label>Banner</Label>
            <ImageField shape="banner" value={p.banner} positionY={p.bannerPositionY} onChange={(banner) => set({ banner, bannerPositionY: banner ? p.bannerPositionY : 0 })} label="Profile banner" />
            {p.banner && (
              <div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="banner-focus">Banner focus</Label>
                  <span className="text-[11px] text-muted-foreground">{p.bannerPositionY}% from the top</span>
                </div>
                <input
                  id="banner-focus"
                  type="range"
                  min={0}
                  max={100}
                  value={p.bannerPositionY}
                  onChange={(e) => set({ bannerPositionY: Number(e.target.value) })}
                  className="mt-2 w-full accent-primary"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={p.bannerPositionY}
                />
                <p className="mt-1 text-xs text-muted-foreground">Drag to choose which part of a tall image stays visible. The default sits 15% from the top, so faces are not cut off.</p>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Animated banner</p>
                <p className="text-xs text-muted-foreground">Slow drifting gradient and shimmer in your accent colors.</p>
              </div>
              <Switch checked={p.bannerAnimated} onCheckedChange={(bannerAnimated) => set({ bannerAnimated })} />
            </div>
            <div>
              <Label>Accent theme</Label>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(ACCENT_THEMES) as AccentTheme[]).map((t) => {
                  const th = ACCENT_THEMES[t];
                  const on = p.accentTheme === t;
                  const locked = !!th.vip && !p.vipThemes && !on;
                  return (
                    <button key={t} type="button"
                      onClick={() => (locked ? toast.error('VIP profile themes are part of the Ultimate plan.') : set({ accentTheme: t }))}
                      title={locked ? 'Ultimate plan required' : undefined}
                      className={cn('relative rounded-xl p-2 ring-1 transition text-left', on ? 'ring-2' : 'ring-white/10 hover:ring-white/30')}
                      style={on ? { boxShadow: `0 0 18px ${th.glow}`, ['--tw-ring-color' as any]: th.accent } : undefined}>
                      <span className="block h-10 rounded-lg" style={{ backgroundImage: th.gradient }} />
                      <span className="mt-1.5 flex items-center justify-between text-xs font-semibold">
                        {th.label}
                        {on ? <Check className="h-3.5 w-3.5" style={{ color: th.accent }} /> : locked ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-card p-5 ring-1 ring-white/5">
            <Label>Bio</Label>
            <p className="text-xs text-muted-foreground mb-2">Rich text and Markdown supported.</p>
            <RichTextEditor value={p.bio} onChange={(bio) => set({ bio })} placeholder="Tell visitors about you and your worlds…" minHeight={160} ariaLabel="Profile bio" />
          </div>

          <div className="space-y-3 rounded-2xl bg-card p-5 ring-1 ring-white/5">
            <Label htmlFor="pf-song">Profile song</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input id="pf-song" className="flex-1" value={profileSongUrl} placeholder="https://example.com/theme.mp3" onChange={(e) => setProfileSongUrl(e.target.value)} />
              <label className={cn('inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-secondary px-3 text-sm font-semibold', songUploading && 'pointer-events-none opacity-60')}>
                <Upload className="h-4 w-4" />
                {songUploading ? 'Uploading…' : 'Choose file'}
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm"
                  className="sr-only"
                  disabled={songUploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) void uploadSong(file);
                  }}
                />
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground">Pick an audio file from your device, or paste a link.</p>
          </div>

          <div className="rounded-2xl bg-card p-5 ring-1 ring-white/5">
            <div className="flex items-center justify-between mb-2">
              <Label className="flex items-center gap-1.5"><Pin className="h-3.5 w-3.5" /> Pinned characters</Label>
              <span className="text-[11px] text-muted-foreground">{p.pinnedCharacterIds.length}/{MAX_PINS}</span>
            </div>
            {p.characters.length === 0 ? (
              <p className="text-sm text-muted-foreground">You haven&apos;t created any characters yet. <Link href="/characters/new" className="text-primary underline">Create one</Link>.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto">
                {p.characters.map((c) => {
                  const on = p.pinnedCharacterIds.includes(c.id);
                  return (
                    <button key={c.id} type="button" onClick={() => togglePin(c.id)}
                      className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition', on ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-secondary')}>
                      <CharacterAvatar src={c.avatar} name={c.name} className="h-8 w-8 text-[10px]" />
                      <span className="flex-1 truncate">{c.name}</span>
                      {on && <Pin className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
      </div>
    </section>
  );
}
