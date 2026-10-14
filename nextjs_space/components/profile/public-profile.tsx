'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Crown, Gem, Globe2, MessageSquare, BookOpen, Sparkles, Pin, Users, Volume2, VolumeX } from 'lucide-react';
import { RichContent } from '@/components/editor/rich-content';
import { CharacterCard, cardAudioTrack } from '@/components/gallery/character-card';
import { ACCENT_THEMES, DEFAULT_BANNER_NAME_SIZE, DEFAULT_PROFILE_STYLE, bannerFocusPosition, bannerNameStyle, isAccentTheme, type ProfileBadge, type ProfileStyle } from '@/lib/profile';
import { cn } from '@/lib/utils';
import { useAccess } from '@/components/billing/access-provider';
import { useNsfwView } from '@/lib/nsfw-view';
import { MobileProfileView } from '@/components/profile/mobile-profile-view';

export interface ProfileCharacter {
  id: string; name: string; title?: string; summary: string; creator?: string; tags: string[];
  avatar: string | null; banner?: string | null; nsfw: boolean; chatCount?: number; ownerId?: string | null;
  audioUrl?: string | null; visibility?: string | null; moderated?: boolean | null;
  hiddenFromPublic?: boolean;
}

export interface PublicProfileData {
  username: string | null;
  displayName: string | null;
  image: string | null;
  bio: string;
  banner: string | null;
  bannerAnimated: boolean;
  bannerPositionY: number;
  accentTheme: string;
  badges: ProfileBadge[];
  stats: { characters: number; loreEntries: number; chats: number };
  profileSongUrl?: string;
  profileStyle?: ProfileStyle;
  bannerNameSize?: number;
  bannerNameColor?: string;
  bannerNameGlow?: boolean;
  profileBgType?: 'image' | 'video';
  profileBgUrl?: string;
  profileBgVideoUrl?: string;
  profileCardOpacity?: number;
  bannerMediaType?: 'image' | 'video';
  bannerVideoUrl?: string;
}

const BADGE_STYLE: Record<ProfileBadge['id'], { icon: typeof Crown; cls: string }> = {
  ADMIN: { icon: Crown, cls: 'bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 text-amber-950 shadow-[0_0_14px_rgba(251,191,36,0.45)]' },
  VIP: { icon: Sparkles, cls: 'bg-gradient-to-r from-teal-300 via-violet-400 to-fuchsia-400 text-violet-950 shadow-[0_0_14px_rgba(167,139,250,0.5)]' },
  TIER: { icon: Gem, cls: 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/40' },
  WORLDBUILDER: { icon: Globe2, cls: 'bg-gradient-to-r from-emerald-500/25 to-cyan-500/25 text-emerald-200 ring-1 ring-emerald-400/40' },
};

export function PublicProfile({ profile, pinned, creations, compact }: {
  profile: PublicProfileData;
  pinned: ProfileCharacter[];
  creations: ProfileCharacter[];
  compact?: boolean;
}) {
  const { status: access } = useAccess();
  const showNsfw = useNsfwView();
  const [owned, setOwned] = useState(creations);
  const canEdit = (c: ProfileCharacter) => !!access?.isCreatorAdmin || (!!access?.userId && c.ownerId === access.userId);
  const keepCard = (c: ProfileCharacter) => showNsfw || !c.nsfw || !!access?.isCreatorAdmin || (!!access?.userId && c.ownerId === access.userId);
  const visibleOwned = owned.filter(keepCard);
  const visiblePinned = pinned.filter(keepCard);

  // Re-apply the full server list when the profile changes so a short first paint cannot stick.
  useEffect(() => {
    setOwned(creations);
  }, [profile.username, creations]);
  const theme = ACCENT_THEMES[isAccentTheme(profile.accentTheme) ? profile.accentTheme : 'OBSIDIAN'];
  const style = profile.profileStyle ?? DEFAULT_PROFILE_STYLE;
  const typeColor = style.typeAccent || theme.accent;
  const cardOpacity = typeof profile.profileCardOpacity === 'number' ? profile.profileCardOpacity : 35;
  const frameStyle = {
    boxShadow: style.glowColor ? `0 0 18px ${style.glowColor}` : undefined,
  };
  const showVideo = profile.profileBgType === 'video' && !!profile.profileBgVideoUrl;
  const bannerIsVideo = profile.bannerMediaType === 'video' && !!profile.bannerVideoUrl;
  const bannerFocus = bannerFocusPosition(profile.bannerPositionY);
  const name = profile.displayName || profile.username || 'Creator';
  const library = visibleOwned;
  const ownProfile = !!access?.username && profile.username === access.username;

  return (
    <>
    <div className="-mx-4 sm:-mx-6 md:hidden">
      <MobileProfileView profile={profile} pinned={visiblePinned} creations={library} canEditCard={canEdit} ownProfile={ownProfile} />
    </div>
    <div className="profile-stage relative hidden md:block" style={{ ['--profile-accent' as any]: theme.accent, ['--profile-glow' as any]: theme.glow, ['--profile-card-opacity' as any]: String(cardOpacity / 100), ['--glitch-overlay-opacity' as any]: String(style.glitchOverlayOpacity) }}>
      {(showVideo || profile.profileBgUrl) && (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-2xl">
          {showVideo ? (
            <video autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-cover" src={profile.profileBgVideoUrl} />
          ) : (
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${profile.profileBgUrl})` }} />
          )}
          <div
            className="absolute inset-0 z-10 transition-opacity duration-150"
            style={{
              backgroundColor: 'rgba(0, 0, 0, var(--glitch-overlay-opacity, 0.5))',
              backdropFilter: style.cardBlur ? `blur(${style.cardBlur}px) saturate(160%)` : undefined,
              WebkitBackdropFilter: style.cardBlur ? `blur(${style.cardBlur}px) saturate(160%)` : undefined,
            }}
          />
        </div>
      )}
      <div className="relative z-10">
      {/* Banner */}
      <div className={cn('profile-banner-wrapper relative w-full overflow-hidden rounded-2xl', compact ? 'h-32' : 'h-44 sm:h-64')}>
        <div className={cn('absolute inset-0', profile.bannerAnimated && !bannerIsVideo && 'profile-banner-animated')} style={{ backgroundImage: theme.gradient }} />
        {bannerIsVideo ? (
          <video
            autoPlay
            loop
            muted
            playsInline
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: bannerFocus }}
            src={profile.bannerVideoUrl}
          />
        ) : profile.banner ? (
          <img
            src={profile.banner}
            alt={`${name} banner`}
            className={cn('absolute inset-0 h-full w-full object-cover', profile.bannerAnimated && 'profile-banner-drift')}
            style={{ objectPosition: bannerFocus, transformOrigin: 'center top' }}
          />
        ) : null}
        {profile.banner && profile.bannerAnimated && !bannerIsVideo && <div className="absolute inset-0 profile-banner-shimmer" />}
        {theme.sovereign && <div className="sovereign-slash pointer-events-none absolute inset-y-0 right-[8%] w-[42%] opacity-80" style={{ backgroundImage: theme.gradient }} />}
        <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div
          className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-150"
          style={{ backgroundColor: 'rgba(0, 0, 0, var(--glitch-overlay-opacity, 0.5))' }}
        />
        <div className="banner-title-container banner-display-name-wrapper top-4 left-6">
          <div className="banner-display-name-container">
            <h1 className={cn('banner-display-name banner-title-wrapper whitespace-nowrap', theme.sovereign && profile.bannerNameGlow && 'sovereign-glitch')} style={bannerNameStyle(profile.bannerNameSize ?? DEFAULT_BANNER_NAME_SIZE, profile.bannerNameColor || style.typeAccent || '', !!profile.bannerNameGlow)}>{name}</h1>
          </div>
          {profile.username && <p className="text-sm font-medium" style={{ color: typeColor }}>@{profile.username}</p>}
        </div>
      </div>

      {/* Identity */}
      <div className={cn('relative px-4 sm:px-8 flex flex-col sm:flex-row sm:items-end gap-4 overflow-visible', compact ? 'mt-4' : 'mt-5')}>
        <div className="flex min-w-0 flex-1 flex-row items-end gap-4 overflow-visible">
        <div
          className={cn('profile-avatar relative shrink-0 rounded-full overflow-hidden bg-secondary ring-4 ring-background flex items-center justify-center font-display font-bold text-3xl', compact ? 'h-20 w-20' : 'h-28 w-28')}
          style={{ boxShadow: `0 0 0 2px ${typeColor}, 0 0 30px ${theme.glow}` }}
        >
          {profile.image ? <img src={profile.image} alt={name} className="h-full w-full object-cover" /> : <span style={{ color: theme.accent }}>{name[0]?.toUpperCase()}</span>}
        </div>
        <div className="overflow-visible pb-1">
          {!compact && access?.username && profile.username === access.username && (
            <Link href="/dashboard/profiles" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
              <Users className="h-3.5 w-3.5" /> All profiles
            </Link>
          )}
          {profile.badges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profile.badges.map((b) => {
                const s = BADGE_STYLE[b.id];
                const Icon = s.icon;
                return <span key={b.id} className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider', s.cls)}><Icon className="h-3 w-3" />{b.label}</span>;
              })}
            </div>
          )}
        </div>
        </div>
        <div className="sm:ml-auto flex gap-4 pb-1 text-sm">
          <Stat icon={Sparkles} value={profile.stats.characters} label="Characters" />
          <Stat icon={MessageSquare} value={profile.stats.chats} label="Chats" />
          <Stat icon={BookOpen} value={profile.stats.loreEntries} label="Lore" />
        </div>
      </div>

      {profile.bio.trim() && (
        compact ? (
          <div className="relative mx-4 mt-6 sm:mx-8">
            <RichContent content={profile.bio} />
          </div>
        ) : (
          <div className={cn('profile-card bio-card relative mt-6 mx-4 sm:mx-8 rounded-2xl p-5', theme.sovereign && 'sovereign-glitch')} style={{ borderTop: `2px solid ${typeColor}`, ...frameStyle }}>
            <RichContent content={profile.bio} />
          </div>
        )
      )}

      {visiblePinned.length > 0 && (
        <Section title="Top 8 Picks" icon={Pin} accent={typeColor} compact={compact} layout="row">
          {visiblePinned.map((item) => <CharacterCard key={item.id} {...item} audioUrl={cardAudioTrack(item)} canEdit={canEdit(item)} showVisibility={canEdit(item)} coverBlur={style.cardBlur} frameStyle={frameStyle} className="profile-card w-56 shrink-0" />)}
        </Section>
      )}
      <Section title={`${ownProfile ? 'My Created Cards' : 'Created Cards'} (${library.length})`} icon={Sparkles} accent={typeColor} compact={compact}>
        {library.length === 0 ? <p className="text-sm text-muted-foreground col-span-full">No characters yet.</p> : library.map((item) => <CharacterCard key={item.id} {...item} audioUrl={cardAudioTrack(item)} canEdit={canEdit(item)} showVisibility={canEdit(item)} coverBlur={style.cardBlur} frameStyle={frameStyle} className="profile-card" />)}
      </Section>
      {profile.profileSongUrl && <ProfileSong url={profile.profileSongUrl} autoplay={!compact && style.songAutoplay} accent={typeColor} />}
      </div>
    </div>
    </>
  );
}

function ProfileSong({ url, autoplay, accent }: { url: string; autoplay: boolean; accent: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(autoplay);

  useEffect(() => {
    const node = audio.current;
    if (!node || !autoplay) return;
    node.muted = true;
    node.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [autoplay, url]);

  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-white/10 bg-card/90 px-3 py-2 shadow-lg backdrop-blur">
      <audio ref={audio} src={url} loop preload="none" />
      <button
        type="button"
        className="text-xs font-semibold"
        style={{ color: accent }}
        onClick={() => {
          const node = audio.current;
          if (!node) return;
          if (node.paused) node.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
          else { node.pause(); setPlaying(false); }
        }}
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      <button type="button" aria-label={muted ? 'Unmute profile song' : 'Mute profile song'} onClick={() => {
        const node = audio.current;
        const next = !muted;
        if (node) node.muted = next;
        setMuted(next);
      }}>
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof Crown; value: number; label: string }) {
  return (
    <div className="text-center">
      <p className="font-display font-bold text-lg leading-none flex items-center gap-1 justify-center"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function Section({ title, icon: Icon, accent, compact, layout, children }: { title: string; icon: typeof Crown; accent: string; compact?: boolean; layout?: 'row'; children: React.ReactNode }) {
  return (
    <section className="mt-8 px-4 py-4 sm:mx-8 sm:px-4">
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold"><Icon className="h-4 w-4" style={{ color: accent }} />{title}</h2>
      <div className={layout === 'row' ? 'flex gap-3 overflow-x-auto pb-2' : cn('grid gap-4 grid-cols-2', !compact && 'md:grid-cols-3 lg:grid-cols-4')}>{children}</div>
    </section>
  );
}
