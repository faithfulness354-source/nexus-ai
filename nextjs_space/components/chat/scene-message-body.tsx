'use client';

import { useEffect, useRef, useState } from 'react';
import { RoleplayText } from '@/components/chat/roleplay-text';
import { parseSceneSegments, type SceneSegment } from '@/lib/scene-tags';
import { useAccess } from '@/components/billing/access-provider';
import { toast } from 'sonner';

interface SceneMessageBodyProps {
  messageId: string;
  content: string;
  streaming?: boolean;
  onContentUpdate?: (next: string) => void;
}

/**
 * Renders chat text plus inline scene images. Pending [GENERATE_IMAGE] tags
 * trigger POST /api/generate-scene once for Ultimate accounts.
 */
export function SceneMessageBody({ messageId, content, streaming, onContentUpdate }: SceneMessageBodyProps) {
  const { status, openPaywall } = useAccess();
  const [localContent, setLocalContent] = useState(content);
  const [busy, setBusy] = useState(false);
  const attempted = useRef<Set<string>>(new Set());

  useEffect(() => {
    setLocalContent(content);
  }, [content]);

  useEffect(() => {
    if (streaming || busy) return;
    const segments = parseSceneSegments(localContent);
    const pending = segments.find((s): s is Extract<SceneSegment, { type: 'pending' }> => s.type === 'pending');
    if (!pending) return;
    const key = `${messageId}:${pending.description}`;
    if (attempted.current.has(key)) return;
    attempted.current.add(key);

    if (!status?.can?.sceneImages) {
      openPaywall('sceneImages');
      return;
    }

    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const res = await fetch('/api/generate-scene', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 402) {
          openPaywall('sceneImages');
          return;
        }
        if (res.status === 429) {
          toast.error(typeof data?.error === 'string' ? data.error : 'Daily image credits are used up.');
          openPaywall('sceneImages');
          return;
        }
        if (!res.ok) {
          toast.error(typeof data?.error === 'string' ? data.error : 'Scene render failed.');
          attempted.current.delete(key);
          return;
        }
        if (typeof data?.content === 'string' && data.content) {
          setLocalContent(data.content);
          onContentUpdate?.(data.content);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Scene render failed.');
          attempted.current.delete(key);
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status?.can?.sceneImages, busy, localContent, messageId, onContentUpdate, openPaywall, streaming]);

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
              {segment.description ? (
                <figcaption className="px-3 py-2 text-xs text-muted-foreground">{segment.description}</figcaption>
              ) : null}
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
