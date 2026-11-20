'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export type CardCoverKind = 'portrait' | 'wide';

/** Wide/banner or UI sheets need contain; square + portrait keep faces with cover-top. */
export function classifyCardCover(width: number, height: number): CardCoverKind {
  if (!width || !height) return 'portrait';
  return width / height >= 1.35 ? 'wide' : 'portrait';
}

const DEFAULT_FOCUS = '50% 0%';

interface CardCoverImageProps {
  src: string;
  alt: string;
  /** Outer frame classes (include aspect-* / absolute inset-0 as needed). */
  className?: string;
  /** CSS object-position for portrait/square cover. Defaults to top-center. */
  focus?: string;
  blurPx?: number;
  imgKey?: string;
  onError?: () => void;
}

/**
 * Card thumbnail that avoids chopping heads on portraits and clipping labels on wide sheets.
 * Container aspect is fixed by the parent; framing adapts after the image dimensions are known.
 */
export function CardCoverImage({
  src,
  alt,
  className,
  focus = DEFAULT_FOCUS,
  blurPx = 0,
  imgKey,
  onError,
}: CardCoverImageProps) {
  const [kind, setKind] = useState<CardCoverKind>('portrait');
  const [seenSrc, setSeenSrc] = useState(src);
  if (src !== seenSrc) {
    setSeenSrc(src);
    setKind('portrait');
  }

  function applyNaturalSize(img: HTMLImageElement) {
    if (!img.naturalWidth || !img.naturalHeight) return;
    setKind(classifyCardCover(img.naturalWidth, img.naturalHeight));
  }

  const wide = kind === 'wide';

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-gradient-to-br from-violet-900/60 via-slate-900 to-fuchsia-900/40',
        className,
      )}
    >
      {wide && (
        <>
          <img
            aria-hidden
            src={src}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-70 blur-2xl"
          />
          <div className="pointer-events-none absolute inset-0 bg-black/60" />
        </>
      )}
      <img
        key={imgKey || src}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={cn(
          'absolute inset-0 h-full w-full',
          wide ? 'object-contain object-center' : 'object-cover',
        )}
        style={{
          objectPosition: wide ? 'center center' : focus,
          filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
        }}
        ref={(node) => {
          if (node?.complete && node.naturalWidth > 0) applyNaturalSize(node);
        }}
        onLoad={(event) => applyNaturalSize(event.currentTarget)}
        onError={onError}
      />
    </div>
  );
}
