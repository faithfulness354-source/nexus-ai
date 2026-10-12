'use client';

import { useState, useEffect } from 'react';
import { AppHeader } from '@/components/layout/app-header';
import { CharacterForm } from '@/components/character/character-form';
import { Skeleton } from '@/components/ui/skeleton';

interface EditCharacterPageProps {
  characterId: string;
}

export function EditCharacterPage({ characterId }: EditCharacterPageProps) {
  const [character, setCharacter] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/characters/${characterId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setCharacter(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [characterId]);

  return (
    <div className="flex flex-col min-h-[100dvh] w-full max-w-full bg-background">
      <AppHeader />
      <main className="flex-1 min-w-0 w-full">
        {loading ? (
          <div className="max-w-3xl mx-auto py-8 px-4 space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : character ? (
          <CharacterForm key={character.id} initialData={character} mode="edit" />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Character not found</p>
          </div>
        )}
      </main>
    </div>
  );
}
