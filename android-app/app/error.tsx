'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">This page hit an unexpected error. You can try again.</p>
      <button type="button" onClick={() => reset()} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
        Try again
      </button>
    </main>
  );
}
