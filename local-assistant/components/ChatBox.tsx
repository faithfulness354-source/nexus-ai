'use client';

import { FormEvent, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ImagePanel } from './ImagePanel';
import type { ChatMessage, InputMode } from '@/lib/types';

export function ChatBox({
  messages,
  mode,
  busy,
  draft,
  sourceImage,
  onDraftChange,
  onModeChange,
  onSourceImageChange,
  onSubmit,
}: {
  messages: ChatMessage[];
  mode: InputMode;
  busy: boolean;
  draft: string;
  sourceImage: string | null;
  onDraftChange: (value: string) => void;
  onModeChange: (mode: InputMode) => void;
  onSourceImageChange: (value: string | null) => void;
  onSubmit: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    onSubmit();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-8">
        {messages.length === 0 && (
          <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-white/10 bg-ink-900/50 p-8 text-center">
            <p className="font-semibold text-mist-100">Local assistant</p>
            <p className="mt-2 text-sm text-mist-500">
              Talk to Ollama / a local OpenAI-compatible server, or render images through A1111, Forge, or ComfyUI.
              Nothing leaves this machine except the ports you configure.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <article
            key={message.id}
            className={`mx-auto max-w-3xl rounded-2xl px-4 py-3 ${
              message.role === 'user'
                ? 'bg-accent/15 ring-1 ring-accent/30'
                : 'bg-ink-900/80 ring-1 ring-white/5'
            }`}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-mist-500">
              {message.role === 'user' ? 'You' : 'Assistant'}
            </p>
            {message.error ? (
              <p className="text-sm text-red-300">{message.error}</p>
            ) : message.role === 'assistant' ? (
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || (busy ? '…' : '')}</ReactMarkdown>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
            )}
            {message.imageDataUrl && <ImagePanel dataUrl={message.imageDataUrl} />}
          </article>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-white/10 bg-ink-900/80 px-4 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onModeChange('text')}
              className={`rounded-full px-3 py-1 text-xs font-medium ${mode === 'text' ? 'bg-accent text-ink-950' : 'bg-ink-800 text-mist-300'}`}
            >
              Text mode
            </button>
            <button
              type="button"
              onClick={() => onModeChange('image')}
              className={`rounded-full px-3 py-1 text-xs font-medium ${mode === 'image' ? 'bg-accent text-ink-950' : 'bg-ink-800 text-mist-300'}`}
            >
              Image mode
            </button>
            {mode === 'image' && (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-full bg-ink-800 px-3 py-1 text-xs font-medium text-mist-300 hover:bg-ink-700"
                  disabled={busy}
                >
                  {sourceImage ? 'Change source (img2img)' : 'Add source (img2img)'}
                </button>
                {sourceImage && (
                  <button
                    type="button"
                    onClick={() => onSourceImageChange(null)}
                    className="rounded-full bg-ink-800 px-3 py-1 text-xs font-medium text-mist-300 hover:bg-ink-700"
                    disabled={busy}
                  >
                    Clear source
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') onSourceImageChange(reader.result);
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </>
            )}
          </div>
          {mode === 'image' && sourceImage && (
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-ink-800/60 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sourceImage} alt="img2img source" className="h-14 w-14 rounded-lg object-cover" />
              <p className="text-xs text-mist-400">
                Source attached — Forge will run img2img with FaceID. Clear the source to generate a fresh txt2img from the prompt alone.
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (!busy && draft.trim()) onSubmit();
                }
              }}
              rows={3}
              placeholder={
                mode === 'image'
                  ? sourceImage
                    ? 'Describe how to transform the source image…'
                    : 'Describe the image to generate (or add a source for img2img)…'
                  : 'Message your local model…'
              }
              className="min-h-[5.5rem] flex-1 resize-y rounded-xl border border-white/10 bg-ink-800 px-3 py-2 text-sm outline-none ring-accent/40 focus:ring-2"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="self-end rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-ink-950 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Working…' : mode === 'image' ? (sourceImage ? 'img2img' : 'Generate') : 'Send'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
