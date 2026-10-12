'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { imageForCard } from '@/lib/upload-client';
import { bannerFocusPosition } from '@/lib/profile';
import { cn } from '@/lib/utils';

/** Click-to-upload image slot (avatar circle or wide banner). */
export function ImageField({ value, onChange, shape = 'circle', label, className, positionY = 0 }: {
  value: string | null;
  onChange: (url: string | null) => void;
  shape?: 'circle' | 'banner';
  label: string;
  className?: string;
  positionY?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await imageForCard(file, shape === 'circle' ? 'avatar' : undefined);
      onChange(url);
    } catch (err: any) {
      console.error('Image upload failed:', err);
      toast.error(err?.message ?? 'Upload failed');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className={cn('relative group', shape === 'circle' ? 'h-24 w-24' : 'w-full aspect-[3/1]', className)}>
      <button
        type="button"
        aria-label={label}
        onClick={() => input.current?.click()}
        className={cn(
          'relative h-full w-full overflow-hidden bg-secondary ring-1 ring-white/10 hover:ring-primary/60 transition flex items-center justify-center',
          shape === 'circle' ? 'rounded-full' : 'rounded-xl'
        )}
      >
        {value ? (
          <img
            src={value}
            alt={label}
            className={cn('absolute inset-0 h-full w-full object-cover', shape === 'banner' && 'object-top')}
            style={{ objectPosition: shape === 'banner' ? bannerFocusPosition(positionY) : 'center center' }}
          />
        ) : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
        <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-xs font-medium text-white">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : value ? 'Change' : 'Upload'}
        </span>
        {busy && <span className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-white" /></span>}
      </button>
      {value && !busy && (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={() => onChange(null)}
          className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-black/80 text-white flex items-center justify-center hover:bg-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
    </div>
  );
}
