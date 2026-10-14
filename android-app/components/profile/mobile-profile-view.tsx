'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, Crown, Gem, Globe2, MessageSquare, Pencil, Pin, Sparkles, X } from 'lucide-react';
import { RichContent } from '@/components/editor/rich-content';
import { ACCENT_THEMES, bannerFocusPosition, isAccentTheme, type ProfileBadge } from '@/lib/profile';
import { cn } from '@/lib/utils';
import type { ProfileCharacter, PublicProfileData } from '@/components/profile/public-profile';

const BADGE_STYLE: Record<ProfileBadge['id'], { icon: typeof Crown; cls: string }> = {
  ADMIN: { icon: Crown, cls: 'bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 text-amber-950' },
  VIP: { icon: Sparkles, cls: 'bg-gradient-to-r from-teal-300 via-violet-400 to-fuchsia-400 text-violet-950' },
  TIER: { icon: Gem, cls: 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/40' },
  WORLDBUILDER: { icon: Globe2, cls: 'bg-gradient-to-r from-emerald-500/25 to-cyan-500/25 text-emerald-200 ring-1 ring-emerald-400/40' },
};

export function MobileProfileView({ profile, pinned, creations, canEditCard, ownProfile }: {
  profile: PublicProfileData;
  pinned: ProfileCharacter[];
  creations: ProfileCharacter[];
  canEditCard: (card: ProfileCharacter) => boolean;
  ownProfile: boolean;
}) {
  const theme = ACCENT_THEMES[isAccentTheme(profile.accentTheme) ? profile.accentTheme : 'OBSIDIAN'];
  const name = profile.displayName || profile.username || 'Creator';
  const [dim, setDim] = useState(45);
  const [editing, setEditing] = useState(false);
  const picks = pinned.length > 0 ? pinned : creations.slice(0, 8);

  return (
    <div className="relative flex w-full flex-col" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
      <div className="relative z-10 flex flex-col">
        <div className="relative h-52 w-full overflow-hidden">
          <div className="absolute inset-0" style={{ backgroundImage: theme.gradient, opacity: 1 - dim / 140 }} />
          {profile.banner ? (
            <img src={profile.banner} alt="" className={cn('absolute inset-0 h-full w-full object-cover', profile.bannerAnimated && 'profile-banner-drift')} style={{ objectPosition: bannerFocusPosition(profile.bannerPositionY), opacity: 1 - dim / 200 }} />
          ) : null}
          <div className="absolute inset-0 bg-black" style={{ opacity: dim / 100 }} />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        </div>

        <div className="flex flex-col gap-3 px-4">
          <div className="-mt-10 flex items-end gap-3">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-secondary ring-4 ring-background" style={{ boxShadow: `0 0 0 2px ${theme.accent}` }}>
              {profile.image ? <img src={profile.image} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center font-display text-2xl font-bold" style={{ color: theme.accent }}>{name[0]?.toUpperCase()}</span>}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <h1 className="break-words font-display text-2xl font-bold leading-tight">{name}</h1>
              {profile.username && <p className="truncate text-sm font-medium" style={{ color: theme.accent }}>@{profile.username}</p>}
            </div>
          </div>

          {profile.badges.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {profile.badges.map((badge) => {
                const style = BADGE_STYLE[badge.id];
                const Icon = style?.icon ?? Sparkles;
                return <span key={badge.id} className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider', style?.cls)}><Icon className="h-3 w-3" />{badge.label}</span>;
              })}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-card px-2 py-3 ring-1 ring-white/10">
            <Stat icon={Sparkles} value={profile.stats.characters} label="Characters" />
            <Stat icon={MessageSquare} value={profile.stats.chats} label="Chats" />
            <Stat icon={BookOpen} value={profile.stats.loreEntries} label="Lore" />
          </div>

          <label className="rounded-2xl bg-card px-3 py-3 ring-1 ring-white/10">
            <span className="mb-2 block text-xs font-semibold text-muted-foreground">Backdrop opacity</span>
            <input type="range" min={0} max={100} value={dim} onChange={(event) => setDim(Number(event.target.value))} className="h-11 w-full accent-primary" aria-label="Backdrop opacity" />
          </label>

          {profile.bio.trim() && (
            <div className="rounded-2xl bg-card p-4 ring-1 ring-white/10" style={{ borderTop: `2px solid ${theme.accent}` }}>
              <RichContent content={profile.bio} />
            </div>
          )}

          {picks.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold"><Pin className="h-4 w-4" style={{ color: theme.accent }} /> Top 8 Picks</h2>
              <div className="flex snap-x gap-3 overflow-x-auto pb-2">
                {picks.map((item) => (
                  <div key={item.id} className="w-40 shrink-0 snap-start">
                    <MobileCard item={item} canEdit={canEditCard(item)} />
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold"><Sparkles className="h-4 w-4" style={{ color: theme.accent }} /> {ownProfile ? 'My Created Cards' : 'Created Cards'} ({creations.length})</h2>
            {creations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No characters yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {creations.map((item) => <MobileCard key={item.id} item={item} canEdit={canEditCard(item)} />)}
              </div>
            )}
          </section>
        </div>
      </div>

      {ownProfile && (
        <button type="button" onClick={() => setEditing(true)} className="fixed inset-x-4 z-40 flex h-12 items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-foreground shadow-lg" style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          <Pencil className="h-4 w-4" /> Edit profile
        </button>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={() => setEditing(false)}>
          <div className="rounded-t-3xl bg-card px-4 pt-3" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }} onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20" />
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Profile</h2>
              <button type="button" aria-label="Close profile editor" onClick={() => setEditing(false)} className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary"><X className="h-5 w-5" /></button>
            </div>
            <Link href="/dashboard/profile" className="flex h-12 items-center rounded-2xl bg-secondary px-4 font-semibold">Edit profile details</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileCard({ item, canEdit }: { item: ProfileCharacter; canEdit: boolean }) {
  const image = item.avatar || item.banner;
  return (
    <article className="overflow-hidden rounded-2xl bg-card ring-1 ring-white/10">
      <Link href={`/characters/${item.id}/chat`} className="block">
        <div className="aspect-[4/3] bg-secondary">
          {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <p className="truncate px-2.5 pt-2 text-sm font-semibold">{item.name}</p>
        <p className="truncate px-2.5 pb-2 text-xs text-muted-foreground">{item.title || 'Open card'}</p>
      </Link>
      {canEdit && <Link href={`/characters/${item.id}/edit`} className="block px-2.5 pb-2.5 text-xs font-semibold text-primary">Edit</Link>}
    </article>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof Crown; value: number; label: string }) {
  return (
    <div className="text-center">
      <p className="flex items-center justify-center gap-1 font-display text-base font-bold leading-none"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
