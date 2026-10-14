'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Crown, Gem, Globe2, MessageSquare, BookOpen, Sparkles, Pin, Users } from 'lucide-react';
import { RichContent } from '@/components/editor/rich-content';
import { CharacterCard, cardAudioTrack } from '@/components/gallery/character-card';
import { ACCENT_THEMES, bannerFocusPosition, isAccentTheme, type ProfileBadge } from '@/lib/profile';
import { cn } from '@/lib/utils';
import { useAccess } from '@/components/billing/access-provider';

export interface ProfileCharacter {
  id: string; name: string; title?: string; summary: string; creator?: string; tags: string[];
  avatar: string | null; banner?: string | null; nsfw: boolean; chatCount?: number; ownerId?: string | null;
  audioUrl?: string | null; visibility?: string | null; moderated?: boolean | null;
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
  const [owned, setOwned] = useState(creations);
  const canEdit = (c: ProfileCharacter) => !!access?.isCreatorAdmin || (!!access?.userId && c.ownerId === access.userId);

  // Re-apply the full server list when the profile changes so a short first paint cannot stick.
  useEffect(() => {
    setOwned(creations);
  }, [profile.username, creations]);
  const theme = ACCENT_THEMES[isAccentTheme(profile.accentTheme) ? profile.accentTheme : 'OBSIDIAN'];
  const name = profile.displayName || profile.username || 'Creator';
  const library = owned;

  return (
    <div style={{ ['--profile-accent' as any]: theme.accent, ['--profile-glow' as any]: theme.glow }}>
      {/* Banner */}
      <div className={cn('relative w-full overflow-hidden rounded-2xl', compact ? 'h-32' : 'h-44 sm:h-64')}>
        <div className={cn('absolute inset-0', profile.bannerAnimated && 'profile-banner-animated')} style={{ backgroundImage: theme.gradient }} />
        {profile.banner && (
          <img
            src={profile.banner}
            alt={`${name} banner`}
            className={cn('absolute inset-0 h-full w-full object-cover object-top', profile.bannerAnimated && 'profile-banner-drift')}
            style={{ objectPosition: bannerFocusPosition(profile.bannerPositionY), transformOrigin: 'center top' }}
          />
        )}
        {profile.banner && profile.bannerAnimated && <div className="absolute inset-0 profile-banner-shimmer" />}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent" />
      </div>

      {/* Identity */}
      <div className={cn('relative px-4 sm:px-8 flex flex-col sm:flex-row sm:items-end gap-4', compact ? '-mt-10' : '-mt-14')}>
        <div
          className={cn('shrink-0 rounded-full overflow-hidden bg-secondary ring-4 ring-background flex items-center justify-center font-display font-bold text-3xl', compact ? 'h-20 w-20' : 'h-28 w-28')}
          style={{ boxShadow: `0 0 0 2px ${theme.accent}, 0 0 30px ${theme.glow}` }}
        >
          {profile.image ? <img src={profile.image} alt={name} className="h-full w-full object-cover" /> : <span style={{ color: theme.accent }}>{name[0]?.toUpperCase()}</span>}
        </div>
        <div className="min-w-0 pb-1">
          <h1 className={cn('font-display font-bold tracking-tight truncate', compact ? 'text-xl' : 'text-2xl sm:text-3xl')}>{name}</h1>
          {profile.username && <p className="text-sm font-medium" style={{ color: theme.accent }}>@{profile.username}</p>}
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
        <div className="sm:ml-auto flex gap-4 pb-1 text-sm">
          <Stat icon={Sparkles} value={profile.stats.characters} label="Characters" />
          <Stat icon={MessageSquare} value={profile.stats.chats} label="Chats" />
          <Stat icon={BookOpen} value={profile.stats.loreEntries} label="Lore" />
        </div>
      </div>

      {profile.bio.trim() && (
        <div className="mt-6 mx-4 sm:mx-8 rounded-2xl bg-card p-5 ring-1 ring-white/5" style={{ borderTop: `2px solid ${theme.accent}` }}>
          <RichContent content={profile.bio} />
        </div>
      )}

      {pinned.length > 0 && (
        <Section title="Top 8 Picks" icon={Pin} accent={theme.accent} compact={compact}>
          {pinned.map((item) => <CharacterCard key={item.id} {...item} audioUrl={cardAudioTrack(item)} canEdit={canEdit(item)} showVisibility={canEdit(item)} />)}
        </Section>
      )}
      <Section title={`Created Cards (${library.length})`} icon={Sparkles} accent={theme.accent} compact={compact}>
        {library.length === 0 ? <p className="text-sm text-muted-foreground col-span-full">No characters yet.</p> : library.map((item) => <CharacterCard key={item.id} {...item} audioUrl={cardAudioTrack(item)} canEdit={canEdit(item)} showVisibility={canEdit(item)} />)}
      </Section>
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

function Section({ title, icon: Icon, accent, compact, children }: { title: string; icon: typeof Crown; accent: string; compact?: boolean; children: React.ReactNode }) {
  return (
    <section className="mt-8 px-4 sm:px-8">
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold"><Icon className="h-4 w-4" style={{ color: accent }} />{title}</h2>
      <div className={cn('grid gap-4 grid-cols-2', !compact && 'md:grid-cols-3 lg:grid-cols-4')}>{children}</div>
    </section>
  );
}
