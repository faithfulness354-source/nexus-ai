'use client';

import { useState } from 'react';
import { mediaVersionUrl } from '@/lib/media-src';
import { cn } from '@/lib/utils';

const GRADIENTS = [
  'from-violet-600 to-fuchsia-500',
  'from-indigo-600 to-violet-500',
  'from-purple-600 to-pink-500',
  'from-slate-600 to-violet-600',
  'from-fuchsia-600 to-rose-500',
];

function pick(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

export function CharacterAvatar({ src, name, className, version }: { src?: string | null; name?: string | null; className?: string; version?: string | number | Date | null }) {
  const [error, setError] = useState(false);
  const label = (name ?? '?').trim() || '?';
  const image = mediaVersionUrl(src, version);
  return (
    <div className={cn('relative shrink-0 rounded-full overflow-hidden flex items-center justify-center font-bold text-white bg-gradient-to-br', pick(label), className)}>
      {image && !error ? (
        <img key={image} src={image} alt={`${label} avatar`} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover object-center" onError={() => setError(true)} />
      ) : (
        <span>{label.slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}
