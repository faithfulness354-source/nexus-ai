'use client';

import { AppHeader } from '@/components/layout/app-header';
import { CharacterForm } from '@/components/character/character-form';

export function NewCharacterPage() {
  return (
    <div className="flex flex-col min-h-[100dvh] w-full max-w-full bg-background">
      <AppHeader />
      <main className="flex-1 min-w-0 w-full">
        <CharacterForm mode="create" />
      </main>
    </div>
  );
}
