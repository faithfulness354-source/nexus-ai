'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, FileJson, Link2, ClipboardPaste, CheckCircle2, Circle, Loader2, XCircle, ImageIcon, MessageCircle, Pencil } from 'lucide-react';
import { toast } from 'sonner';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

type Phase = 'idle' | 'sending' | 'parsing' | 'done' | 'error';
interface Report {
  id: string; name: string; avatar: string | null; tags: string[];
  importReport?: { source: string; avatar: boolean; filled: Record<string, boolean | number> };
}

const MAX_FILE = 15 * 1024 * 1024;

/** POSTs with upload progress (fetch has none). */
function send(body: FormData | string, onUpload: (pct: number) => void): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/characters/import');
    if (typeof body === 'string') xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.upload.onprogress = (e) => e.lengthComputable && onUpload(Math.round((e.loaded / e.total) * 100));
    xhr.upload.onload = () => onUpload(100);
    xhr.onload = () => {
      let data: any = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON */ }
      resolve({ status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error('Network error — check your connection.'));
    xhr.send(body);
  });
}

export function ImportModal({ open, onClose, onImported }: ImportModalProps) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState('file');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState('');
  const [report, setReport] = useState<Report | null>(null);

  const [previewFile, setPreviewFile] = useState<File | null>(null);
  if (previewFile !== file) {
    setPreviewFile(file);
    if (!file || !file.type.startsWith('image/')) setPreview(null);
  }

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) return;
    const u = URL.createObjectURL(file);
    let cancel = false;
    queueMicrotask(() => { if (!cancel) setPreview(u); });
    return () => {
      cancel = true;
      URL.revokeObjectURL(u);
    };
  }, [file]);

  const busy = phase === 'sending' || phase === 'parsing';

  function reset() {
    setFile(null); setUrl(''); setJsonText(''); setPhase('idle'); setUploadPct(0); setError(''); setReport(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  function close() {
    if (busy) return;
    reset();
    onClose?.();
  }

  function pickFile(f: File | undefined | null) {
    if (!f) return;
    setError('');
    if (!/\.(png|json)$/i.test(f.name) && !['image/png', 'application/json'].includes(f.type)) {
      setError('Choose a character card .png or .json file.');
      return;
    }
    if (f.size > MAX_FILE) { setError('That file is larger than 15 MB.'); return; }
    setFile(f);
  }

  async function runImport() {
    setError('');
    let body: FormData | string;
    if (tab === 'file') {
      if (!file) return setError('Choose a .png or .json card first.');
      body = new FormData();
      body.append('file', file);
    } else if (tab === 'url') {
      if (!/^https?:\/\/\S+$/i.test(url.trim())) return setError('Paste a full link starting with https://');
      body = JSON.stringify({ url: url.trim() });
    } else {
      if (!jsonText.trim()) return setError('Paste the character JSON first.');
      body = JSON.stringify({ text: jsonText });
    }
    setPhase('sending');
    setUploadPct(0);
    try {
      const { status, data } = await send(body, (pct) => {
        setUploadPct(pct);
        if (pct >= 100) setPhase('parsing');
      });
      setPhase('parsing');
      if (status === 403 && data?.code === 'NSFW_LOCKED') {
        throw new Error('This card is tagged NSFW. Importing NSFW characters needs age verification and a paid plan.');
      }
      if (status === 401) throw new Error('Please sign in to import characters.');
      if (status < 200 || status >= 300) throw new Error(data?.error ?? 'Import failed');
      setReport(data);
      setPhase('done');
      toast.success(`${data?.name ?? 'Character'} imported!`);
      onImported?.();
    } catch (err: any) {
      console.error('Character import failed:', err);
      setError(err?.message ?? 'Failed to import');
      setPhase('error');
    }
  }

  const sourceLabel = tab === 'url' ? 'Fetching character link' : tab === 'file' ? 'Uploading card file' : 'Sending JSON';
  const steps: { label: string; state: 'todo' | 'active' | 'done' | 'fail' }[] = [
    { label: sourceLabel, state: phase === 'sending' ? 'active' : phase === 'idle' ? 'todo' : phase === 'error' && uploadPct < 100 && tab === 'file' ? 'fail' : 'done' },
    { label: tab === 'file' && file?.name.toLowerCase().endsWith('.png') ? 'Reading PNG metadata (chara / ccv3)' : 'Parsing character data', state: phase === 'parsing' ? 'active' : phase === 'done' ? 'done' : phase === 'error' ? 'fail' : 'todo' },
    { label: 'Saving avatar & creating character', state: phase === 'done' ? 'done' : phase === 'parsing' ? 'active' : 'todo' },
  ];

  const filled = report?.importReport?.filled ?? {};
  const fieldRows: [string, boolean][] = [
    ['Character Definition', !!filled.definition],
    ['Scenario', !!filled.scenario],
    ['Initial Message', !!filled.initialMessage],
    ['Example Dialogues', !!filled.exampleDialogue],
    [`Tags (${Number(filled.tags ?? 0)})`, Number(filled.tags ?? 0) > 0],
    ['Avatar from card image', !!report?.importReport?.avatar],
  ];

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => !v && close()}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-primary" />
            Import Character Card
          </DialogTitle>
          <DialogDescription>
            Janitor AI, Chub and Tavern cards — PNG with embedded metadata, Card V2/V3 JSON, or a public character link.
          </DialogDescription>
        </DialogHeader>

        {phase === 'done' && report ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
                {report.avatar ? (
                  <img src={report.avatar} alt={`${report.name} avatar`} className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="absolute inset-0 m-auto h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold truncate">{report.name}</p>
                <p className="text-xs text-muted-foreground truncate">From {report.importReport?.source ?? 'card'}</p>
              </div>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm">
              {fieldRows.map(([label, ok]) => (
                <li key={label} className="flex items-center gap-2">
                  {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                  <span className={ok ? '' : 'text-muted-foreground'}>{label}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={reset}>Import another</Button>
              <Button variant="outline" onClick={() => { const id = report.id; reset(); onClose?.(); router.push(`/characters/${id}/edit`); }}>
                <Pencil className="h-4 w-4 mr-1" />Review & edit
              </Button>
              <Button onClick={() => { const id = report.id; reset(); onClose?.(); router.push(`/characters/${id}/chat`); }}>
                <MessageCircle className="h-4 w-4 mr-1" />Start chat
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Tabs value={tab} onValueChange={(v) => { if (!busy) { setTab(v); setError(''); setPhase('idle'); } }}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="file" disabled={busy}><Upload className="h-4 w-4 mr-1" />File</TabsTrigger>
                <TabsTrigger value="url" disabled={busy}><Link2 className="h-4 w-4 mr-1" />Link</TabsTrigger>
                <TabsTrigger value="json" disabled={busy}><ClipboardPaste className="h-4 w-4 mr-1" />Paste</TabsTrigger>
              </TabsList>

              <TabsContent value="file" className="pt-3">
                <input ref={fileInput} type="file" accept=".png,.json,image/png,application/json" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]); }}
                  className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${dragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/60 hover:bg-muted/30'}`}
                >
                  {preview ? (
                    <img src={preview} alt="Selected card preview" className="h-28 w-auto max-w-full rounded-lg object-contain shadow-lg" />
                  ) : file ? (
                    <FileJson className="h-10 w-10 text-primary" />
                  ) : (
                    <Upload className="h-8 w-8 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">{file ? file.name : 'Drop a card here or click to choose'}</span>
                  <span className="text-xs text-muted-foreground">
                    {file ? `${(file.size / 1024).toFixed(0)} KB · click to change` : '.png (Janitor AI / Tavern / Chub) or .json (Card V2 / V3) · max 15 MB'}
                  </span>
                </button>
              </TabsContent>

              <TabsContent value="url" className="pt-3 space-y-2">
                <label htmlFor="import-url" className="block text-sm font-medium">Paste Character Web Link / Janitor AI Link</label>
                <Input
                  id="import-url"
                  type="url"
                  value={url}
                  disabled={busy}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runImport(); } }}
                  placeholder="https://janitorai.com/characters/…  or  https://chub.ai/characters/…"
                />
                <p className="text-xs text-muted-foreground">
                  Works with public Janitor AI, Chub and Character Tavern pages, or a direct link to a card .png / .json. Some sites block automated access or hide definitions — if so, download the card and use the File tab.
                </p>
              </TabsContent>

              <TabsContent value="json" className="pt-3 space-y-2">
                <label htmlFor="import-json" className="block text-sm font-medium">Paste raw character JSON</label>
                <Textarea
                  id="import-json"
                  placeholder='{"spec": "chara_card_v2", "data": {"name": "…", "description": "…", "first_mes": "…"}}'
                  value={jsonText}
                  disabled={busy}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setJsonText(e.target.value)}
                  rows={8}
                  className="font-mono text-xs"
                />
              </TabsContent>
            </Tabs>

            {phase !== 'idle' && (
              <div className="space-y-2 rounded-xl bg-muted/30 p-3" aria-live="polite">
                {tab === 'file' && phase === 'sending' && <Progress value={uploadPct} className="h-1.5" />}
                {steps.map((s) => (
                  <div key={s.label} className="flex items-center gap-2 text-sm">
                    {s.state === 'done' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                    {s.state === 'active' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {s.state === 'fail' && <XCircle className="h-4 w-4 text-destructive" />}
                    {s.state === 'todo' && <Circle className="h-4 w-4 text-muted-foreground" />}
                    <span className={s.state === 'todo' ? 'text-muted-foreground' : ''}>
                      {s.label}{s.state === 'active' && tab === 'file' && phase === 'sending' ? ` — ${uploadPct}%` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
              <Button onClick={runImport} loading={busy}>
                <Upload className="h-4 w-4 mr-1" />
                Import
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
