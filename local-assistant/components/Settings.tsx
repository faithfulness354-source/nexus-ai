'use client';

import { useEffect, useState } from 'react';
import type { LocalSettings } from '@/lib/types';

export function Settings({
  open,
  settings,
  onClose,
  onChange,
}: {
  open: boolean;
  settings: LocalSettings;
  onClose: () => void;
  onChange: (next: LocalSettings) => void;
}) {
  const [models, setModels] = useState<string[]>([]);
  const [modelError, setModelError] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    void (async () => {
      setLoadingModels(true);
      setModelError(null);
      try {
        const params = new URLSearchParams({
          backend: settings.textBackend,
          ollamaBaseUrl: settings.ollamaBaseUrl,
          openaiCompatBaseUrl: settings.openaiCompatBaseUrl,
        });
        const res = await fetch(`/api/models?${params.toString()}`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (cancel) return;
        if (!res.ok) setModelError(data?.error || 'Could not list models');
        const list = Array.isArray(data?.models) ? data.models : [];
        setModels(list);
        if (list.length && !list.includes(settings.model)) {
          onChange({ ...settings, model: list[0] });
        }
      } catch (err: unknown) {
        if (!cancel) setModelError(err instanceof Error ? err.message : 'Could not list models');
      } finally {
        if (!cancel) setLoadingModels(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open, settings.textBackend, settings.ollamaBaseUrl, settings.openaiCompatBaseUrl]);

  if (!open) return null;

  function patch<K extends keyof LocalSettings>(key: K, value: LocalSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-ink-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="font-semibold text-mist-100">Local settings</h2>
            <p className="text-xs text-mist-500">Ports, models, and image sampler controls</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-mist-300 hover:bg-white/5">
            Close
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-mist-500">Text LLM</h3>
            <label className="block text-sm">
              <span className="mb-1 block text-mist-300">Backend</span>
              <select
                className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2"
                value={settings.textBackend}
                onChange={(event) => patch('textBackend', event.target.value as LocalSettings['textBackend'])}
              >
                <option value="ollama">Ollama (`/api/generate`)</option>
                <option value="openai-compat">OpenAI-compatible (`/v1/chat/completions`)</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-mist-300">Ollama base URL</span>
              <input
                className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 font-mono text-xs"
                value={settings.ollamaBaseUrl}
                onChange={(event) => patch('ollamaBaseUrl', event.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-mist-300">OpenAI-compatible base URL</span>
              <input
                className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 font-mono text-xs"
                value={settings.openaiCompatBaseUrl}
                onChange={(event) => patch('openaiCompatBaseUrl', event.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-mist-300">Model tag</span>
              <select
                className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2"
                value={settings.model}
                onChange={(event) => patch('model', event.target.value)}
              >
                {!settings.model && <option value="">Select a model</option>}
                {models.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
              {loadingModels && <p className="mt-1 text-xs text-mist-500">Refreshing installed models…</p>}
              {modelError && <p className="mt-1 text-xs text-red-300">{modelError}</p>}
            </label>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-mist-500">Image generator</h3>
            <label className="block text-sm">
              <span className="mb-1 block text-mist-300">Backend</span>
              <select
                className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2"
                value={settings.imageBackend}
                onChange={(event) => patch('imageBackend', event.target.value as LocalSettings['imageBackend'])}
              >
                <option value="a1111">Automatic1111 / Forge</option>
                <option value="comfyui">ComfyUI</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-mist-300">A1111 / Forge base URL</span>
              <input
                className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 font-mono text-xs"
                value={settings.a1111BaseUrl}
                onChange={(event) => patch('a1111BaseUrl', event.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-mist-300">ComfyUI base URL</span>
              <input
                className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 font-mono text-xs"
                value={settings.comfyBaseUrl}
                onChange={(event) => patch('comfyBaseUrl', event.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-mist-300">Negative prompt</span>
              <textarea
                className="min-h-20 w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm"
                value={settings.negativePrompt}
                onChange={(event) => patch('negativePrompt', event.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-mist-300">Steps</span>
                <input
                  type="number"
                  min={1}
                  max={150}
                  className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2"
                  value={settings.steps}
                  onChange={(event) => patch('steps', Number(event.target.value))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-mist-300">CFG scale</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  step={0.5}
                  className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2"
                  value={settings.cfgScale}
                  onChange={(event) => patch('cfgScale', Number(event.target.value))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-mist-300">Width</span>
                <input
                  type="number"
                  min={64}
                  max={2048}
                  step={64}
                  className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2"
                  value={settings.width}
                  onChange={(event) => patch('width', Number(event.target.value))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-mist-300">Height</span>
                <input
                  type="number"
                  min={64}
                  max={2048}
                  step={64}
                  className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2"
                  value={settings.height}
                  onChange={(event) => patch('height', Number(event.target.value))}
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-mist-300">Sampler</span>
              <input
                className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2"
                value={settings.samplerName}
                onChange={(event) => patch('samplerName', event.target.value)}
                placeholder="Euler a"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
                onClick={() => onChange({ ...settings, width: 512, height: 768 })}
              >
                512×768
              </button>
              <button
                type="button"
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
                onClick={() => onChange({ ...settings, width: 832, height: 1216, samplerName: 'DPM++ 2M Karras' })}
              >
                SDXL 832×1216
              </button>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
