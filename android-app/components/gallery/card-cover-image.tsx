'use client';

import { cn } from '@/lib/utils';

interface CardCoverImageProps {
  src: string;
  alt: string;
  /** Outer frame classes (include aspect-* / absolute inset-0 as needed). */
  className?: string;
  /** Optional extra blur on the foreground (profile style). */
  blurPx?: number;
  imgKey?: string;
  onError?: () => void;
}

/**
 * Two-layer auto-fit card cover:
 * - blurred / darkened backdrop fills the frame
 * - foreground uses object-contain so faces, text, and side characters stay visible
 */
export function CardCoverImage({
  src,
  alt,
  className,
  blurPx = 0,
  imgKey,
  onError,
}: CardCoverImageProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-gradient-to-br from-violet-900/60 via-slate-900 to-fuchsia-900/40',
        className,
      )}
    >
      <img
        aria-hidden
        src={src}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-md brightness-50"
      />
      <img
        key={imgKey || src}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 z-10 h-full w-full object-contain object-center"
        style={blurPx > 0 ? { filter: `blur(${blurPx}px)` } : undefined}
        onError={onError}
      />
    </div>
  );
}
