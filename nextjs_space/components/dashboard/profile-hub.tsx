'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Save, ExternalLink, Check, Pin, AtSign, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RichTextEditor } from '@/components/editor/rich-text-editor';
import { CharacterAvatar } from '@/components/character/character-avatar';
import { ImageField } from './image-field';
import { PublicProfile, type ProfileCharacter } from '@/components/profile/public-profile';
import { BoxGlitchLayers, GlitchSrcProvider } from '@/components/profile/box-glitch';
import { ACCENT_THEMES, DEFAULT_BANNER_NAME_SIZE, DEFAULT_PROFILE_STYLE, FEATURED_CARD_MAX, ROYAL_BLUE_ALLOY, SOVEREIGN_LOCK_LABEL, USERNAME_RE, applyBadgePrefs, type AccentTheme, type BadgePrefs, type ProfileBadge, type ProfileStyle } from '@/lib/profile';
import { uploadImage, uploadProfileAudio, uploadProfileVideo } from '@/lib/upload-client';
import { cn } from '@/lib/utils';
import { useAccess } from '@/components/billing/access-provider';
import { NsfwContentSetting } from '@/components/settings/nsfw-content-setting';
import { subscribeNsfwView } from '@/lib/nsfw-view';

interface ProfileState {
  username: string | null;
  displayName: string | null;
  image: string | null;
  bio: string;
  banner: string | null;
  bannerAnimated: boolean;
  bannerPositionY: number;
  bannerMediaType: 'image' | 'video';
  bannerVideoUrl: string;
  accentTheme: string;
  pinnedCharacterIds: string[];
  stats: { characters: number; loreEntries: number; lorebooks: number; personas: number; chats: number };
  badges: ProfileBadge[];
  earnedBadges: ProfileBadge[];
  vipThemes: boolean;
  sovereignUnlocked: boolean;
  profileSongUrl: string;
  profileStyle: ProfileStyle;
  badgePrefs: BadgePrefs;
  bannerNameSize: number;
  bannerNameColor: string;
  bannerNameGlow: boolean;
  profileBgType: 'image' | 'video';
  profileBgUrl: string;
  profileBgVideoUrl: string;
  profileCardOpacity: number;
  characters: ProfileCharacter[];
}

const MAX_PINS = FEATURED_CARD_MAX;

export function ProfileHub() {
  const { status, refresh: refreshAccess } = useAccess();
  const [p, setP] = useState<ProfileState | null>(null);
  const [saving, setSaving] = useState(false);
  const [songUploading, setSongUploading] = useState(false);
  const [savedUsername, setSavedUsername] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    function load() {
      fetch('/api/profile')
        .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); return d; })
        .then((d) => {
          if (cancel) return;
          const prefs = d.badgePrefs ?? { order: [], hidden: [] };
          const earned = Array.isArray(d.earnedBadges) ? d.earnedBadges : (d.badges ?? []);
          const ordered = [...earned].sort((a, b) => {
            const ia = prefs.order.indexOf(a.id);
            const ib = prefs.order.indexOf(b.id);
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
          });
          setP({
            ...d,
            earnedBadges: ordered,
            profileSongUrl: d.profileSongUrl ?? '',
            profileStyle: { ...DEFAULT_PROFILE_STYLE, ...(d.profileStyle ?? {}) },
            badgePrefs: prefs,
            bannerNameSize: typeof d.bannerNameSize === 'number' ? d.bannerNameSize : DEFAULT_BANNER_NAME_SIZE,
            bannerNameColor: d.bannerNameColor ?? '',
            bannerNameGlow: !!d.bannerNameGlow,
            profileBgType: d.profileBgType === 'video' ? 'video' : 'image',
            profileBgUrl: d.profileBgUrl ?? '',
            profileBgVideoUrl: d.profileBgVideoUrl ?? '',
            profileCardOpacity: typeof d.profileCardOpacity === 'number' ? d.profileCardOpacity : 35,
            bannerMediaType: d.bannerMediaType === 'video' ? 'video' : 'image',
            bannerVideoUrl: d.bannerVideoUrl ?? '',
            sovereignUnlocked: !!d.sovereignUnlocked,
          });
          setSavedUsername(d.username);
        })
        .catch((err) => { console.error(err); if (!cancel) toast.error(err?.message ?? 'Failed to load profile'); });
    }
    load();
    const unsubscribe = subscribeNsfwView(load);
    return () => { cancel = true; unsubscribe(); };
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
    if (!file || !p) return;
    setSongUploading(true);
    try {
      const payload = await uploadProfileAudio(file);
      set({ profileSongUrl: payload.url });
      const saved = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileSongUrl: payload.url }),
      });
      const data = await saved.json().catch(() => ({}));
      if (!saved.ok) throw new Error(data.error || 'Could not save the song');
      set({ profileSongUrl: payload.url });
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
          profileSongUrl: p.profileSongUrl, profileStyle: p.profileStyle, badgePrefs: p.badgePrefs,
          bannerNameSize: p.bannerNameSize, bannerNameColor: p.bannerNameColor, bannerNameGlow: p.bannerNameGlow,
          bannerMediaType: p.bannerMediaType, bannerImageUrl: p.banner, bannerVideoUrl: p.bannerVideoUrl,
          profileBgType: p.profileBgType, profileBgUrl: p.profileBgUrl, profileBgVideoUrl: p.profileBgVideoUrl, profileCardOpacity: p.profileCardOpacity,
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
    <section className="profile-settings bg-black" style={{ ['--profile-card-opacity' as string]: String(p.profileCardOpacity / 100), ['--glitch-overlay-opacity' as string]: String(p.profileStyle.glitchOverlayOpacity) }}>
      <GlitchSrcProvider src={p.profileBgVideoUrl}>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
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

      <NsfwContentSetting />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5 min-w-0">
          <div className="settings-panel customization-box rounded-2xl bg-card p-5 ring-1 ring-white/5 space-y-4">
            <BoxGlitchLayers />
            <div className="flex gap-4 items-start">
              <ImageField value={p.image} onChange={(image) => void changeAvatar(image)} label="Profile avatar" />
              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <Label htmlFor="pf-user">Username</Label>
                  <div className="relative">
                    <AtSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="banner-name-size">Banner name size</Label>
                      <span className="text-[11px] text-muted-foreground">{p.bannerNameSize.toFixed(2)}rem</span>
                    </div>
                    <input id="banner-name-size" type="range" min={1.2} max={2.5} step={0.1} value={Math.min(2.5, Math.max(1.2, p.bannerNameSize))} className="w-full accent-primary" aria-label="Banner name size" onChange={(e) => set({ bannerNameSize: Number(e.target.value) })} />
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-xs text-muted-foreground">Name color
                        <input type="color" className="mt-1 block h-9 w-16 bg-transparent" aria-label="Banner name color" value={/^#[0-9a-fA-F]{6}$/.test(p.bannerNameColor) ? p.bannerNameColor : '#1852f6'} onChange={(e) => set({ bannerNameColor: e.target.value })} />
                      </label>
                      <Button type="button" variant={p.bannerNameColor === ROYAL_BLUE_ALLOY ? 'default' : 'secondary'} size="sm" onClick={() => set({ bannerNameColor: ROYAL_BLUE_ALLOY })}>Royal Blue Alloy</Button>
                      <div className="flex items-center gap-2">
                        <Switch checked={p.bannerNameGlow} onCheckedChange={(bannerNameGlow) => set({ bannerNameGlow })} aria-label="Sovereign name glow" />
                        <span className="text-xs text-muted-foreground">RGB glitch glow</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="settings-panel customization-box rounded-2xl bg-card p-5 ring-1 ring-white/5 space-y-4">
            <BoxGlitchLayers />
            <Label>Banner</Label>
            <div className="space-y-3">
              <Label>Banner Media Type</Label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant={p.bannerMediaType === 'image' ? 'default' : 'secondary'} onClick={() => set({ bannerMediaType: 'image' })}>Static Banner Image</Button>
                <Button type="button" size="sm" variant={p.bannerMediaType === 'video' ? 'default' : 'secondary'} onClick={() => set({ bannerMediaType: 'video' })}>Looped Banner Video</Button>
              </div>
              <div>
                <Label htmlFor="banner-image-url">Banner image URL</Label>
                <Input id="banner-image-url" value={p.banner ?? ''} placeholder="https://example.com/banner.jpg" onChange={(e) => set({ banner: e.target.value || null, bannerMediaType: 'image' })} />
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="mt-2 block text-xs" aria-label="Upload banner image" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  try {
                    const up = await uploadImage(file);
                    setP((prev) => prev ? { ...prev, banner: up.url, bannerMediaType: 'image' } : prev);
                  } catch (err: any) {
                    toast.error(err?.message ?? 'Could not create upload URL');
                  }
                }} />
              </div>
              <div>
                <Label htmlFor="banner-video-url">Banner video URL</Label>
                <Input id="banner-video-url" value={p.bannerVideoUrl} placeholder="https://example.com/banner.mp4" onChange={(e) => set({ bannerVideoUrl: e.target.value, bannerMediaType: 'video' })} />
                <input type="file" accept="video/mp4,video/webm" className="mt-2 block text-xs" aria-label="Upload looped banner video" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  try {
                    const up = await uploadProfileVideo(file);
                    setP((prev) => prev ? { ...prev, bannerVideoUrl: up.url, bannerMediaType: 'video' } : prev);
                  } catch (err: any) {
                    toast.error(err?.message ?? 'Could not create upload URL');
                  }
                }} />
                <p className="mt-1 text-[11px] text-muted-foreground">MP4 or WebM. It loops muted inside the banner.</p>
              </div>
            </div>
            <ImageField shape="banner" value={p.banner} positionY={p.bannerPositionY} onChange={(banner) => set({ banner, bannerMediaType: banner ? 'image' : p.bannerMediaType, bannerPositionY: banner ? p.bannerPositionY : 0 })} label="Profile banner" />
            {(p.banner || p.bannerVideoUrl) && (
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
            <div className="settings-panel space-y-3 rounded-xl bg-secondary/30 p-3">
              <BoxGlitchLayers />
              <Label>Background Media Type</Label>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={p.profileBgType === 'image' ? 'default' : 'secondary'} onClick={() => set({ profileBgType: 'image' })}>Static Image</Button>
                <Button type="button" size="sm" variant={p.profileBgType === 'video' ? 'default' : 'secondary'} onClick={() => set({ profileBgType: 'video' })}>Looped Video (MP4 / WebM)</Button>
              </div>
              <div>
                <Label htmlFor="pf-bg-url">Background image URL</Label>
                <Input id="pf-bg-url" value={p.profileBgUrl} placeholder="https://example.com/backdrop.jpg" onChange={(e) => set({ profileBgUrl: e.target.value })} />
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="mt-2 block text-xs" aria-label="Upload background image" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  try {
                    const up = await uploadImage(file);
                    setP((prev) => prev ? { ...prev, profileBgUrl: up.url, profileBgType: 'image' } : prev);
                  } catch (err: any) {
                    toast.error(err?.message ?? 'Could not create upload URL');
                  }
                }} />
              </div>
              <div>
                <Label htmlFor="pf-bg-video">Background video URL</Label>
                <Input id="pf-bg-video" value={p.profileBgVideoUrl} placeholder="https://example.com/loop.mp4" onChange={(e) => set({ profileBgVideoUrl: e.target.value })} />
                <input type="file" accept="video/mp4,video/webm" className="mt-2 block text-xs" aria-label="Upload 10 second background video" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  try {
                    const up = await uploadProfileVideo(file);
                    setP((prev) => prev ? { ...prev, profileBgVideoUrl: up.url, profileBgType: 'video' } : prev);
                  } catch (err: any) {
                    toast.error(err?.message ?? 'Could not create upload URL');
                  }
                }} />
                <p className="mt-1 text-[11px] text-muted-foreground">MP4 or WebM, 10 seconds or shorter. It loops muted behind the profile.</p>
              </div>
            </div>
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
                  const sovereignOpen = !!(status?.isAdmin || status?.isCreatorAdmin || p.sovereignUnlocked);
                  const sovereignLocked = !!th.sovereign && !sovereignOpen;
                  const vipLocked = !!th.vip && !p.vipThemes && !on;
                  const locked = sovereignLocked || vipLocked;
                  return (
                    <button key={t} type="button"
                      disabled={sovereignLocked}
                      onClick={() => (vipLocked ? toast.error('VIP profile themes are part of the Ultimate plan.') : set({ accentTheme: t }))}
                      title={sovereignLocked ? SOVEREIGN_LOCK_LABEL : vipLocked ? 'Ultimate plan required' : undefined}
                      className={cn('relative overflow-hidden rounded-xl p-2 ring-1 transition text-left', on ? 'ring-2' : 'ring-white/10 hover:ring-white/30', sovereignLocked && 'cursor-not-allowed opacity-80', th.sovereign && 'sovereign-glitch')}
                      style={on ? { boxShadow: `0 0 18px ${th.glow}`, ['--tw-ring-color' as any]: th.accent } : undefined}>
                      <span className={cn('relative block h-10 overflow-hidden rounded-lg', th.sovereign && 'sovereign-slash')} style={{ backgroundImage: th.gradient }}>
                        {th.sovereign && <span className="sovereign-scan absolute inset-0" />}
                      </span>
                      <span className="mt-1.5 flex items-center justify-between text-xs font-semibold">
                        {th.label}
                        {on ? <Check className="h-3.5 w-3.5" style={{ color: th.accent }} /> : locked ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                      </span>
                      {sovereignLocked && <span className="mt-1 block text-[10px] font-semibold leading-snug text-muted-foreground">{SOVEREIGN_LOCK_LABEL}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="settings-panel customization-box rounded-2xl bg-card p-5 ring-1 ring-white/5">
            <BoxGlitchLayers />
            <Label>Bio</Label>
            <p className="text-xs text-muted-foreground mb-2">Rich text and Markdown supported.</p>
            <RichTextEditor value={p.bio} onChange={(bio) => set({ bio })} placeholder="Tell visitors about you and your worlds…" minHeight={160} ariaLabel="Profile bio" />
          </div>

          <div className="settings-panel customization-box rounded-2xl bg-card p-5 ring-1 ring-white/5 space-y-3">
            <BoxGlitchLayers />
            <Label htmlFor="pf-song">Profile song</Label>
            <Input id="pf-song" value={p.profileSongUrl} placeholder="https://example.com/theme.mp3" onChange={(e) => set({ profileSongUrl: e.target.value })} />
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm"
              disabled={songUploading}
              aria-label="Choose profile song file"
              className="block w-full cursor-pointer text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-semibold"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void uploadSong(file);
              }}
            />
            <p className="text-[11px] text-muted-foreground">{songUploading ? 'Uploading…' : 'Choose an audio file from your device, or paste a link.'}</p>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Autoplay on your public page. Visitors can mute it.</p>
              <Switch checked={p.profileStyle.songAutoplay} onCheckedChange={(songAutoplay) => set({ profileStyle: { ...p.profileStyle, songAutoplay } })} aria-label="Autoplay profile song" />
            </div>
          </div>

          <div className="settings-panel customization-box rounded-2xl bg-card p-5 ring-1 ring-white/5 space-y-4">
            <BoxGlitchLayers />
            <Label>Card look</Label>
            <div>
              <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Background blur</span><span className="text-[11px] text-muted-foreground">{p.profileStyle.cardBlur}px</span></div>
              <input type="range" min={0} max={24} value={p.profileStyle.cardBlur} className="mt-1 w-full accent-primary" aria-label="Card background blur" onChange={(e) => set({ profileStyle: { ...p.profileStyle, cardBlur: Number(e.target.value) } })} />
            </div>
            <div>
              <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Container Box Opacity</span><span className="text-[11px] text-muted-foreground">{p.profileCardOpacity}%</span></div>
              <input type="range" min={0} max={100} value={p.profileCardOpacity} className="mt-1 w-full accent-primary" aria-label="Container Box Opacity" onChange={(e) => set({ profileCardOpacity: Number(e.target.value) })} />
            </div>
            <div className="my-4 space-y-2">
              <label className="flex justify-between text-sm font-semibold text-cyan-300">
                <span>Glitch Media Tint Darkness</span>
                <span>{Math.round(p.profileStyle.glitchOverlayOpacity * 100)}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={0.9}
                step={0.05}
                value={p.profileStyle.glitchOverlayOpacity}
                onChange={(e) => set({ profileStyle: { ...p.profileStyle, glitchOverlayOpacity: Number(e.target.value) } })}
                className="w-full cursor-pointer accent-cyan-400"
                aria-label="Glitch Background Opacity / Contrast"
              />
              <p className="text-xs text-slate-400">
                Increase darkness to make bio text easier to read over high-intensity glitch video loops.
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="text-xs text-muted-foreground">Glow color
                <input type="color" className="mt-1 block h-9 w-16 bg-transparent" value={p.profileStyle.glowColor || '#00f2fe'} aria-label="Glowing border color" onChange={(e) => set({ profileStyle: { ...p.profileStyle, glowColor: e.target.value } })} />
              </label>
              <label className="text-xs text-muted-foreground">Type accent
                <input type="color" className="mt-1 block h-9 w-16 bg-transparent" value={p.profileStyle.typeAccent || '#00f2fe'} aria-label="Typography accent" onChange={(e) => set({ profileStyle: { ...p.profileStyle, typeAccent: e.target.value } })} />
              </label>
            </div>
          </div>

          <div className="settings-panel customization-box rounded-2xl bg-card p-5 ring-1 ring-white/5 space-y-2">
            <BoxGlitchLayers />
            <Label>Badge showcase</Label>
            {p.earnedBadges.length === 0 ? <p className="text-sm text-muted-foreground">Badges appear here as you publish cards and unlock plans.</p> : p.earnedBadges.map((badge, index) => {
              const shown = !p.badgePrefs.hidden.includes(badge.id);
              const move = (dir: -1 | 1) => {
                const order = p.earnedBadges.map((item) => item.id);
                const next = index + dir;
                if (next < 0 || next >= order.length) return;
                const swapped = [...order];
                const [item] = swapped.splice(index, 1);
                swapped.splice(next, 0, item);
                set({ badgePrefs: { ...p.badgePrefs, order: swapped }, earnedBadges: swapped.map((id) => p.earnedBadges.find((entry) => entry.id === id)!).filter(Boolean) });
              };
              return (
                <div key={badge.id} className="flex items-center gap-2 rounded-lg bg-secondary/40 px-2 py-1.5">
                  <span className="flex-1 text-sm font-medium">{badge.label}</span>
                  <Button type="button" variant="ghost" size="xs" disabled={index === 0} onClick={() => move(-1)} aria-label={`Move ${badge.label} up`}>Up</Button>
                  <Button type="button" variant="ghost" size="xs" disabled={index === p.earnedBadges.length - 1} onClick={() => move(1)} aria-label={`Move ${badge.label} down`}>Down</Button>
                  <Switch checked={shown} aria-label={`Show ${badge.label}`} onCheckedChange={(on) => set({ badgePrefs: { ...p.badgePrefs, hidden: on ? p.badgePrefs.hidden.filter((id) => id !== badge.id) : [...p.badgePrefs.hidden, badge.id] } })} />
                </div>
              );
            })}
          </div>

          <div className="settings-panel customization-box rounded-2xl bg-card p-5 ring-1 ring-white/5">
            <BoxGlitchLayers />
            <div className="flex items-center justify-between mb-2">
              <Label className="flex items-center gap-1.5"><Pin className="h-3.5 w-3.5" /> Featured Cards</Label>
              <span className="text-[11px] text-muted-foreground">{p.pinnedCharacterIds.length}/{MAX_PINS}</span>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">Pin 4 to 8 favorite cards at the top of your public page.</p>
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

        <div className="min-w-0">
          <div className="lg:sticky lg:top-20">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Live preview</p>
            <div className="settings-panel live-preview-box rounded-2xl bg-background ring-1 ring-white/10 pb-6">
              <BoxGlitchLayers />
              <PublicProfile
                compact
                profile={{ ...p, username: username || null, badges: applyBadgePrefs(p.earnedBadges, p.badgePrefs) }}
                pinned={pinned}
                creations={p.characters}
                onProfileSong={(profileSongUrl) => set({ profileSongUrl })}
              />
            </div>
          </div>
        </div>
      </div>
      </GlitchSrcProvider>
    </section>
  );
}
