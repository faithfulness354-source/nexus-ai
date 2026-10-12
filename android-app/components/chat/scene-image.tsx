'use client';

import { useState } from 'react';
import { ImageIcon, Loader2, RefreshCw, Maximize2, ImageOff } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export function SceneImage({ url, description }: { url: string; description: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="my-3 flex items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
        <ImageOff className="h-4 w-4" /> Scene image could not be loaded.
      </div>
    );
  }
  return (
    <>
      <figure className="my-3 overflow-hidden rounded-xl ring-1 ring-white/10 shadow-lg shadow-black/30">
        <button type="button" onClick={() => setOpen(true)} className="group/scene relative block w-full bg-muted">
          <img
            src={url}
            alt={description || 'Rendered roleplay scene'}
            className="block max-h-[70vh] w-full object-contain"
            loading="lazy"
            onError={() => setFailed(true)}
          />
          <span className="absolute right-2 top-2 rounded-md bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover/scene:opacity-100">
            <Maximize2 className="h-3.5 w-3.5" />
          </span>
        </button>
        {description && (
          <figcaption className="bg-background/60 px-3 py-2 text-[11px] italic text-muted-foreground line-clamp-2">{description}</figcaption>
        )}
      </figure>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl p-2 bg-card">
          <DialogTitle className="sr-only">Scene image</DialogTitle>
          <img src={url} alt={description || 'Rendered roleplay scene'} className="w-full h-auto rounded-lg" />
          {description && <p className="px-2 pb-1 text-xs italic text-muted-foreground">{description}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PendingScene({ description, rendering, onRender }: { description: string; rendering?: boolean; onRender?: () => void }) {
  return (
    <div className="my-3 overflow-hidden rounded-xl ring-1 ring-primary/25 bg-gradient-to-br from-primary/10 via-card to-cyan-500/5">
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 px-6 text-center">
        {rendering ? (
          <>
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p className="text-sm font-medium">Rendering scene…</p>
            <p className="text-[11px] text-muted-foreground">Matching the character gallery references</p>
          </>
        ) : (
          <>
            <ImageIcon className="h-7 w-7 text-primary/80" />
            <p className="text-xs italic text-muted-foreground line-clamp-3 max-w-md">{description}</p>
            {onRender && (
              <button
                type="button"
                onClick={onRender}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Render scene
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
