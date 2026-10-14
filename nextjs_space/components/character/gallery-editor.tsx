'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Trash2, Star, UserCircle2, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { uploadImage } from '@/lib/upload-client';
import type { GalleryImage } from '@/lib/types';

interface Props {
  value: GalleryImage[];
  onChange: (next: GalleryImage[]) => void;
  characterName: string;
  onUseAsAvatar: (url: string) => void;
}

function newId() {
  return `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function GalleryEditor({ value, onChange, characterName, onUseAsAvatar }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const latest = useRef(value);
  latest.current = value;

  async function handleFiles(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setUploading((n) => n + list.length);
    for (const file of list) {
      try {
        const up = await uploadImage(file, 'card');
        const base = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
        const label = latest.current.length === 0 ? (characterName || base) : base;
        const next = [...latest.current, { id: newId(), label, url: up.url, cloud_storage_path: up.cloud_storage_path, isPublic: up.isPublic }];
        latest.current = next;
        onChange(next);
      } catch (err: any) {
        console.error('Gallery upload failed:', err);
        toast.error(err?.message ?? 'Upload failed');
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  function update(id: string, patch: Partial<GalleryImage>) {
    onChange(value.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function makePrimary(id: string) {
    const item = value.find((g) => g.id === id);
    if (!item) return;
    onChange([item, ...value.filter((g) => g.id !== id)]);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {value.map((g, i) => (
          <div key={g.id} className="rounded-xl bg-background ring-1 ring-border overflow-hidden">
            <div className="relative aspect-[3/4] bg-muted">
              <img src={g.url} alt={g.label || `${characterName} reference ${i + 1}`} className="absolute inset-0 h-full w-full object-cover" />
              {i === 0 && (
                <span className="absolute left-2 top-2 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">Primary</span>
              )}
              <div className="absolute right-1.5 top-1.5 flex flex-col gap-1">
                {i !== 0 && (
                  <button type="button" title="Make primary reference" aria-label="Make primary reference" onClick={() => makePrimary(g.id)} className="rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80">
                    <Star className="h-3.5 w-3.5" />
                  </button>
                )}
                <button type="button" title="Use as card image" aria-label="Use as card image" onClick={() => { onUseAsAvatar(g.url); toast.success('Card image updated'); }} className="rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80">
                  <UserCircle2 className="h-3.5 w-3.5" />
                </button>
                <button type="button" title="Remove" aria-label="Remove image" onClick={() => onChange(value.filter((x) => x.id !== g.id))} className="rounded-md bg-black/60 p-1.5 text-white hover:bg-rose-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <Input
              value={g.label}
              onChange={(e) => update(g.id, { label: e.target.value })}
              placeholder="Label, e.g. Luna – battle armor"
              className="h-8 rounded-none border-0 border-t border-border text-xs focus-visible:ring-0"
            />
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading > 0}
          className="aspect-[3/4] rounded-xl border-2 border-dashed border-border hover:border-primary/60 hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground disabled:opacity-60"
        >
          {uploading > 0 ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <ImagePlus className="h-6 w-6" />}
          <span className="text-xs font-medium">{uploading > 0 ? `Uploading ${uploading}…` : 'Add images'}</span>
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      <p className="text-xs text-muted-foreground">
        Label each image with who or what it shows (e.g. “Luna”, “Kael – casual outfit”, “Luna – angry”). When a scene mentions a label, that image is sent as the visual reference; otherwise the primary image is used.
      </p>
    </div>
  );
}
