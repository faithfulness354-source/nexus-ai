'use client';

import { CharacterCard, cardAudioTrack } from './character-card';
import { Skeleton } from '@/components/ui/skeleton';
import { UserPlus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useNsfwView } from '@/lib/nsfw-view';

interface CharacterGridProps {
  characters: any[];
  loading: boolean;
  onTagClick?: (tag: string) => void;
  /** Current viewer, used to show Edit only on characters they own (admins edit all). */
  viewerId?: string | null;
  isAdmin?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
}

const GRID = 'grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4';

export function CharacterGrid({ characters, loading, onTagClick, viewerId, isAdmin, emptyTitle, emptyHint }: CharacterGridProps) {
  const showNsfw = useNsfwView();
  const visible = (characters ?? []).filter((character) => showNsfw || !character?.nsfw);
  if (loading) {
    return (
      <div className={GRID}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-card overflow-hidden">
            <Skeleton className="aspect-[16/10] rounded-none" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-12 w-12 rounded-full -mt-8" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if ((visible?.length ?? 0) === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <UserPlus className="h-8 w-8 text-primary" />
        </div>
        <h3 className="font-display font-semibold text-lg mb-2">{emptyTitle ?? 'No characters found'}</h3>
        <p className="text-muted-foreground text-sm mb-4">{emptyHint ?? 'Try another search or tag — or create your own.'}</p>
        <Link href="/characters/new">
          <Button>Create Character</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className={GRID}>
      {visible.map((item) => (
        <CharacterCard
          key={item.id}
          {...item}
          audioUrl={cardAudioTrack(item)}
          canEdit={!!isAdmin || (!!viewerId && item.ownerId === viewerId)}
          onTagClick={onTagClick}
        />
      ))}
    </div>
  );
}
