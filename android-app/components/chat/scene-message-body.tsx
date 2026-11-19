'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RoleplayText } from '@/components/chat/roleplay-text';
import { parseSceneSegments, type SceneSegment } from '@/lib/scene-tags';
import { useAccess } from '@/components/billing/access-provider';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

interface SceneMessageBodyProps {
  messageId: string;
  content: string;
  streaming?: boolean;
  onContentUpdate?: (next: string) => void;
}

type ScenePreview = {
  generationCount: number;
  cost: number;
  allowed: boolean;
  label: string;
};

/**
 * Renders chat text plus inline scene images. Pending [GENERATE_IMAGE] tags
 * auto-trigger /api/generate-scene; rendered scenes expose an escalating-cost reroll button.
 */
export function SceneMessageBody({ messageId, content, streaming, onContentUpdate }: SceneMessageBodyProps) {
  const { status, openPaywall } = useAccess();
  const [localContent, setLocalContent] = useState(content);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ScenePreview | null>(null);
  const attempted = useRef<Set<string>>(new Set());

  useEffect(() => {
    setLocalContent(content);
  }, [content]);

  const refreshPreview = useCallback(async () => {
    try {
      const res = await fetch(`/api/generate-scene?messageId=${encodeURIComponent(messageId)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setPreview({
        generationCount: Number(data.generationCount ?? 0),
        cost: Number(data.cost ?? 1),
        allowed: data.allowed !== false,
        label: typeof data.label === 'string' ? data.label : 'Regenerate',
      });
    } catch {
      /* ignore preview failures */
    }
  }, [messageId]);

  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview, localContent]);

  const runGenerate = useCallback(async (opts?: { reroll?: boolean }) => {
    if (busy || streaming) return;
    if (!status?.can?.sceneImages) {
      openPaywall('sceneImages');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/generate-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, reroll: opts?.reroll === true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        openPaywall('sceneImages');
        return;
      }
      if (res.status === 429) {
        toast.error(typeof data?.error === 'string' ? data.error : 'Image generation limit reached.');
        if (data?.code === 'OUT_OF_IMAGE_CREDITS') openPaywall('sceneImages');
        await refreshPreview();
        return;
      }
      if (!res.ok) {
        toast.error(typeof data?.error === 'string' ? data.error : 'Scene render failed.');
        return;
      }
      if (typeof data?.content === 'string' && data.content) {
        setLocalContent(data.content);
        onContentUpdate?.(data.content);
      }
      if (data?.next) {
        setPreview({
          generationCount: Number(data.next.generationCount ?? data.generationCount ?? 0),
          cost: Number(data.next.cost ?? 1),
          allowed: data.next.allowed !== false,
          label: typeof data.next.label === 'string' ? data.next.label : 'Regenerate',
        });
      } else {
        await refreshPreview();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Scene render failed.');
    } finally {
      setBusy(false);
    }
  }, [busy, messageId, onContentUpdate, openPaywall, refreshPreview, status?.can?.sceneImages, streaming]);

  useEffect(() => {
    if (streaming || busy) return;
    const segments = parseSceneSegments(localContent);
    const pending = segments.find((s): s is Extract<SceneSegment, { type: 'pending' }> => s.type === 'pending');
    if (!pending) return;
    const key = `${messageId}:${pending.description}`;
    if (attempted.current.has(key)) return;
    attempted.current.add(key);
    void runGenerate().catch(() => {
      attempted.current.delete(key);
    });
  }, [busy, localContent, messageId, runGenerate, streaming]);

  const segments = parseSceneSegments(localContent);
  if (!segments.some((s) => s.type !== 'text')) {
    return <RoleplayText content={localContent} streaming={streaming} />;
  }

  return (
    <div className="space-y-3">
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return <RoleplayText key={`t-${index}`} content={segment.text} />;
        }
        if (segment.type === 'image') {
          return (
            <figure key={`i-${index}`} className="overflow-hidden rounded-xl ring-1 ring-white/10 bg-black/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={segment.url} alt={segment.description || 'Scene'} className="w-full max-h-[28rem] object-contain bg-black/40" />
              <figcaption className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">{segment.description || 'Scene render'}</span>
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  disabled={busy || streaming || preview?.allowed === false}
                  onClick={() => void runGenerate({ reroll: true })}
                  className="shrink-0"
                >
                  <RotateCcw className={`h-3 w-3 mr-1 ${busy ? 'animate-spin' : ''}`} />
                  {busy ? 'Rendering…' : (preview?.label ?? 'Regenerate (2 Credits)')}
                </Button>
              </figcaption>
            </figure>
          );
        }
        return (
          <div key={`p-${index}`} className="rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-4 text-sm text-muted-foreground">
            {busy ? 'Rendering scene…' : `Pending scene: ${segment.description}`}
          </div>
        );
      })}
      {streaming ? <span className="inline-block w-1.5 h-4 bg-primary/70 animate-pulse align-text-bottom" /> : null}
    </div>
  );
}
