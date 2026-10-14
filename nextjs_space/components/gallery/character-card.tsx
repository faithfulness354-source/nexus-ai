'use client';

import { useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { Pencil, MessageSquare, BadgeCheck } from 'lucide-react';
import { htmlToPlainText } from '@/lib/rich-text';
import { visibilityBadgeClass, visibilityLabel } from '@/lib/card-visibility';
import { CharacterAudioPlayer } from '@/components/character/CharacterAudioPlayer';
import { mediaVersionUrl } from '@/lib/media-src';
import { cn } from '@/lib/utils';
import { BoxGlitchLayers } from '@/components/profile/box-glitch';
interface CharacterCardProps {
  id: string;
  name: string;
  title?: string;
  summary: string;
  scenario?: string;
  creator?: string;
  tags: string[];
  avatar: string | null;
  banner?: string | null;
  updatedAt?: string | number | Date | null;
  nsfw: boolean;
  chatCount?: number;
  /** Owner or admin: shows the pencil Edit action. */
  canEdit?: boolean;
  /** Author and creator admin: show Draft / Public / Unlisted / Moderated. */
  showVisibility?: boolean;
  visibility?: string | null;
  moderated?: boolean | null;
  onTagClick?: (tag: string) => void;
  themeSong?: string | null;
  audioUrl?: string | null;
  audio_url?: string | null;
  song_id?: string | null;
  /** Owner or admin view of a card visitors without NSFW access cannot see. */
  hiddenFromPublic?: boolean;
  coverBlur?: number;
  frameStyle?: CSSProperties;
  className?: string;
  glitch?: boolean;
}

function formatCount(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

export function cardAudioTrack(item?: { audioUrl?: string | null; audio_url?: string | null; themeSong?: string | null; song_id?: string | null } | null) {
  const direct = String(item?.audioUrl || item?.audio_url || item?.themeSong || '').trim();
  if (direct) return direct;
  const song = String(item?.song_id || '').trim();
  return /^(https?:|\/)/i.test(song) ? song : '';
}

export function CharacterCard({ id, name, title, summary, scenario, creator, tags, avatar, banner, updatedAt, nsfw, chatCount = 0, canEdit = false, showVisibility = false, visibility, moderated, onTagClick, audioUrl, audio_url, themeSong, song_id, hiddenFromPublic = false, coverBlur = 0, frameStyle, className, glitch = false }: CharacterCardProps) {
  const [imageError, setImageError] = useState(false);
  const raw = String(avatar || banner || '').trim();
  const savedStamp = updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt ? String(updatedAt) : '';
  const fallbackStamp = useRef({ raw: '', stamp: '' });
  if (!savedStamp && fallbackStamp.current.raw !== raw) fallbackStamp.current = { raw, stamp: raw ? String(Date.now()) : '' };
  const version = savedStamp || fallbackStamp.current.stamp;
  const cover = !imageError ? mediaVersionUrl(raw, version) : '';
  // Card preview is a short plain-text excerpt of the rich bio (HTML/Markdown stripped).
  const track = cardAudioTrack({ audioUrl, audio_url, themeSong, song_id });
  const blurb = htmlToPlainText(summary || scenario || '').replace(/[#*_`>]|!?\[([^\]]*)\]\([^)]*\)/g, '$1').trim();

  return (
    <div className={cn('group relative flex flex-col rounded-2xl bg-card overflow-hidden shadow-lg shadow-black/30 ring-1 ring-white/5 transition-shadow duration-300 touch-manipulation md:transition-all md:hover:-translate-y-1 hover:ring-primary/40 hover:shadow-primary/10', className)} style={frameStyle}>
      {glitch && <BoxGlitchLayers />}
      {/* Whole card opens the chat */}
      <Link href={`/characters/${id}/chat`} className="absolute inset-0 z-10 touch-manipulation" aria-label={`Chat with ${name}`} />

      {/* Banner */}
      <div className="relative aspect-[16/10] bg-gradient-to-br from-violet-900/60 via-slate-900 to-fuchsia-900/40 overflow-hidden">
        {cover && (
          <img
            key={`${raw}-${version}`}
            src={cover}
            alt={`${name} card image`}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover object-center"
            style={{ filter: coverBlur > 0 ? `blur(${coverBlur}px)` : undefined }}
            onError={() => setImageError(true)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
        <span
          className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white"
          aria-label={`${chatCount} chats`}
        >
          <MessageSquare className="h-3 w-3" />
          {formatCount(chatCount)}
        </span>
        {nsfw && (
          <span className="absolute top-2 left-2 rounded-md bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">NSFW</span>
        )}
        {hiddenFromPublic && (
          <span className="absolute bottom-2 left-2 z-20 max-w-[78%] rounded-md bg-black/80 px-1.5 py-0.5 text-[9px] font-semibold leading-tight text-amber-100">
            Hidden from Public / Unsubscribed Viewers
          </span>
        )}
        {showVisibility && (
          <span className={`absolute left-2 z-20 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${nsfw ? 'top-8' : 'top-2'} ${visibilityBadgeClass(visibility, moderated)}`}>
            {visibilityLabel(visibility, moderated)}
          </span>
        )}
        {canEdit && (
          <Link
            href={`/characters/${id}/edit`}
            aria-label={`Edit ${name}`}
            title="Edit character"
            className="absolute top-2 right-2 z-20 inline-flex h-8 touch-manipulation items-center gap-1 rounded-full bg-black/70 px-2.5 text-[11px] font-semibold text-white shadow-md transition-colors hover:bg-primary"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>Edit</span>
          </Link>
        )}
      </div>

      {/* Body */}
      <div className="relative flex flex-1 flex-col px-3 pb-3 pt-3">
        <h3 className="font-display font-bold text-[15px] leading-tight truncate">{name || 'Unnamed'}</h3>
        {title?.trim() && <p className="mt-0.5 text-[11px] italic text-muted-foreground truncate">{title}</p>}
        <span className="mt-1 inline-flex w-fit max-w-full items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
          <BadgeCheck className="h-3 w-3 shrink-0" />
          <span className="truncate">@{creator || 'Anonymous'}</span>
        </span>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground line-clamp-3">{blurb || 'No description yet.'}</p>

        <div className="mt-auto pt-3">
          <div className="flex flex-wrap gap-1 min-w-0">
            {Array.isArray(tags) && tags.slice(0, 3).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={(e) => { e.stopPropagation(); onTagClick?.(tag); }}
                className="relative z-20 touch-manipulation rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-foreground/80 hover:bg-primary/20 hover:text-primary transition-colors"
              >
                #{tag}
              </button>
            ))}
            {(tags?.length ?? 0) > 3 && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">+{tags.length - 3}</span>
            )}
          </div>
        </div>
      </div>
      {track && (
        <CharacterAudioPlayer audioUrl={track} label={name} className="absolute bottom-3 right-3 z-30" />
      )}
    </div>
  );
}
