'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/** How the cover should fit a square card frame once natural dimensions are known. */
export type CardCoverKind = 'square' | 'tall' | 'wide';

/**
 * Most Nexus cards are 1:1 portraits. Tall art keeps heads with cover-top;
 * wide banners / UI sheets use contain + backdrop so labels are not clipped.
 */
export function classifyCardCover(width: number, height: number): CardCoverKind {
  if (!width || !height) return 'square';
  const ratio = width / height;
  if (ratio >= 1.2) return 'wide';
  if (ratio <= 0.9) return 'tall';
  return 'square';
}

const DEFAULT_FOCUS = '50% 0%';

interface CardCoverImageProps {
  src: string;
  alt: string;
  /** Outer frame classes (include aspect-* / absolute inset-0 as needed). */
  className?: string;
  /** CSS object-position for tall/square cover. Defaults to top-center. */
  focus?: string;
  blurPx?: number;
  imgKey?: string;
  onError?: () => void;
}

/**
 * Card thumbnail framing: no layout shift (parent owns aspect-square),
 * faces stay in frame for tall art, and wide sheets letterbox on a dark blur.
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
  const [kind, setKind] = useState<CardCoverKind>('square');
  const [seenSrc, setSeenSrc] = useState(src);
  if (src !== seenSrc) {
    setSeenSrc(src);
    setKind('square');
  }

  function applyNaturalSize(img: HTMLImageElement) {
    if (!img.naturalWidth || !img.naturalHeight) return;
    setKind(classifyCardCover(img.naturalWidth, img.naturalHeight));
  }

  const wide = kind === 'wide';
  const tall = kind === 'tall';

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
          wide ? 'object-contain object-center' : tall ? 'object-cover object-top' : 'object-cover object-center',
        )}
        style={{
          objectPosition: wide ? 'center center' : tall ? focus : '50% 50%',
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
