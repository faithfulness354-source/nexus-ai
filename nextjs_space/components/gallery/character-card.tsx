'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pencil, MessageSquare, BadgeCheck } from 'lucide-react';
import { CharacterAvatar } from '@/components/character/character-avatar';
import { htmlToPlainText } from '@/lib/rich-text';
import { visibilityBadgeClass, visibilityLabel } from '@/lib/card-visibility';
import { CharacterAudioPlayer } from '@/components/character/CharacterAudioPlayer';

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
}

function formatCount(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

export function CharacterCard({ id, name, title, summary, scenario, creator, tags, avatar, banner, nsfw, chatCount = 0, canEdit = false, showVisibility = false, visibility, moderated, onTagClick, audioUrl }: CharacterCardProps) {
  const [bannerError, setBannerError] = useState(false);
  const cover = !bannerError ? banner || avatar : null;
  // Card preview is a short plain-text excerpt of the rich bio (HTML/Markdown stripped).
  const blurb = htmlToPlainText(summary || scenario || '').replace(/[#*_`>]|!?\[([^\]]*)\]\([^)]*\)/g, '$1').trim();

  return (
    <div className="group relative flex flex-col rounded-2xl bg-card overflow-hidden shadow-lg shadow-black/30 ring-1 ring-white/5 transition-all duration-300 hover:-translate-y-1 hover:ring-primary/40 hover:shadow-primary/10">
      {/* Whole card opens the chat */}
      <Link href={`/characters/${id}/chat`} className="absolute inset-0 z-10" aria-label={`Chat with ${name}`} />

      {/* Banner */}
      <div className="relative aspect-[16/10] bg-gradient-to-br from-violet-900/60 via-slate-900 to-fuchsia-900/40 overflow-hidden">
        {cover && (
          <img
            src={cover}
            alt={`${name} banner`}
            className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
            style={{ objectPosition: '50% 15%', transformOrigin: 'center top' }}
            onError={() => setBannerError(true)}
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
            className="absolute top-2 right-2 z-20 inline-flex h-8 items-center gap-1 rounded-full bg-black/70 px-2.5 text-[11px] font-semibold text-white shadow-md transition-colors hover:bg-primary"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>Edit</span>
          </Link>
        )}
      </div>

      {/* Body */}
      <div className="relative flex flex-1 flex-col px-3 pb-3 -mt-7">
        <CharacterAvatar src={avatar} name={name} className="h-14 w-14 text-lg ring-4 ring-card shadow-lg" />

        <h3 className="mt-2 font-display font-bold text-[15px] leading-tight truncate">{name || 'Unnamed'}</h3>
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
                onClick={() => onTagClick?.(tag)}
                className="relative z-20 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-foreground/80 hover:bg-primary/20 hover:text-primary transition-colors"
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
      {canEdit && audioUrl?.trim() && (
        <CharacterAudioPlayer audioUrl={audioUrl} label={name} className="absolute bottom-3 right-3 z-30" />
      )}
    </div>
  );
}
