'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/** Client error boundary for /u/[username] — never leave the user on a blank 500 shell. */
export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[profile-error-boundary]', error?.message, error?.digest);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-2xl font-bold">Profile temporarily unavailable</h1>
      <p className="text-sm text-muted-foreground">
        Something went wrong while loading this creator page. You can retry or head back to Discover.
      </p>
      {error?.digest ? (
        <p className="font-mono text-[11px] text-muted-foreground">ref {error.digest}</p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-2 pt-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Try again
        </button>
        <Link href="/" className="inline-flex h-10 items-center rounded-full bg-secondary px-4 text-sm font-semibold">
          Discover
        </Link>
      </div>
    </div>
  );
}
