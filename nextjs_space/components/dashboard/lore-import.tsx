'use client';

import { useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { LoreEntryData } from '@/lib/hubs';

/** Uploads a SillyTavern / Janitor JSON file or a character-card PNG into one lorebook. */
export function LoreImportButton({
  lorebookId,
  disabled,
  onImported,
}: {
  lorebookId?: string;
  disabled?: boolean;
  onImported: (entries: Array<LoreEntryData & { id: string }>) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onFile(file?: File) {
    if (!file || !lorebookId || busy) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`/api/lorebooks/${lorebookId}/import`, { method: 'POST', body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? 'Import failed');
      toast.success(`Imported ${data.inserted ?? 0} entries`);
      onImported(Array.isArray(data.entries) ? data.entries : []);
      setOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
      setOver(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={disabled || !lorebookId}
        title={lorebookId ? 'Import JSON or a character-card PNG' : 'Save the lorebook before importing'}
        onClick={() => setOpen(true)}
      >
        <Upload className="h-4 w-4 mr-1" />
        Import
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import world info</DialogTitle>
            <DialogDescription>
              Drop a SillyTavern or Janitor JSON file, or a character card PNG with embedded lore. Entries are appended in one batch.
            </DialogDescription>
          </DialogHeader>
          <input
            ref={input}
            type="file"
            accept=".json,.png,application/json,image/png"
            className="hidden"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              void onFile(event.dataTransfer.files?.[0]);
            }}
            className={`flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 text-sm transition ${over ? 'border-primary bg-primary/10' : 'border-white/15 bg-card'}`}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5 text-primary" />}
            <span>{busy ? 'Importing…' : 'Drop a .json or .png here, or click to choose a file'}</span>
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
