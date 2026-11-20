'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChatBox } from './ChatBox';
import { Settings } from './Settings';
import { Sidebar } from './Sidebar';
import { loadConversations, loadSettings, newId, saveConversations, saveSettings } from '@/lib/settings-client';
import type { ChatMessage, Conversation, InputMode, LocalSettings } from '@/lib/types';
import {
  VENICE_MAX_RETRIES,
  VENICE_REQUEST_TIMEOUT_MS,
  VENICE_RETRY_BASE_DELAY_MS,
} from '@/lib/venice-config';

export function AppShell() {
  const [settings, setSettings] = useState<LocalSettings | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<InputMode>('text');
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  /** Optional source for ComfyUI/A1111 img2img. */
  const [sourceImage, setSourceImage] = useState<string | null>(null);

  useEffect(() => {
    const loadedSettings = loadSettings();
    const loadedConversations = loadConversations();
    setSettings(loadedSettings);
    setConversations(loadedConversations);
    setActiveId(loadedConversations[0]?.id ?? null);
  }, []);

  useEffect(() => {
    if (!settings) return;
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!settings) return;
    saveConversations(conversations);
  }, [conversations, settings]);

  const active = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) ?? null,
    [conversations, activeId],
  );

  function upsertConversation(next: Conversation) {
    setConversations((current) => {
      const others = current.filter((item) => item.id !== next.id);
      return [next, ...others].sort((a, b) => b.updatedAt - a.updatedAt);
    });
    setActiveId(next.id);
  }

  function createConversation(): Conversation {
    const conversation: Conversation = {
      id: newId(),
      title: 'New chat',
      messages: [],
      updatedAt: Date.now(),
    };
    upsertConversation(conversation);
    return conversation;
  }

  function updateMessages(conversationId: string, updater: (messages: ChatMessage[]) => ChatMessage[], title?: string) {
    setConversations((current) =>
      current.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        return {
          ...conversation,
          title: title || conversation.title,
          messages: updater(conversation.messages),
          updatedAt: Date.now(),
        };
      }),
    );
  }

  async function submit() {
    if (!settings || !draft.trim() || busy) return;
    const prompt = draft.trim();
    setDraft('');
    setBusy(true);

    let conversation = active;
    if (!conversation) conversation = createConversation();
    const conversationId = conversation.id;
    const userMessage: ChatMessage = {
      id: newId(),
      role: 'user',
      content: prompt,
      createdAt: Date.now(),
    };
    const title = conversation.messages.length === 0 ? prompt.slice(0, 48) : conversation.title;
    updateMessages(conversationId, (messages) => [...messages, userMessage], title);

    try {
      if (mode === 'image') {
        // Only an explicitly attached source triggers img2img. Never reuse last chat image
        // (that bled into Forge as init_images / FaceID tensors and looped the same output).
        const initImage = sourceImage || null;
        await runImage(conversationId, prompt, settings, initImage);
        setSourceImage(null);
      } else {
        await runChat(conversationId, prompt, settings, [...conversation.messages, userMessage]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function runChat(
    conversationId: string,
    prompt: string,
    localSettings: LocalSettings,
    history: ChatMessage[],
  ) {
    if (!localSettings.model) {
      updateMessages(conversationId, (messages) => [
        ...messages,
        {
          id: newId(),
          role: 'assistant',
          content: '',
          error: 'Pick an installed model in Settings before chatting.',
          createdAt: Date.now(),
        },
      ]);
      setSettingsOpen(true);
      return;
    }

    const assistantId = newId();
    updateMessages(conversationId, (messages) => [
      ...messages,
      { id: assistantId, role: 'assistant', content: '', createdAt: Date.now() },
    ]);

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        messages: history
          .filter((message) => message.role === 'user' || message.role === 'assistant')
          .map((message) => ({ role: message.role, content: message.content })),
        model: localSettings.model,
        backend: localSettings.textBackend,
        ollamaBaseUrl: localSettings.ollamaBaseUrl,
        openaiCompatBaseUrl: localSettings.openaiCompatBaseUrl,
        stream: true,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      updateMessages(conversationId, (messages) =>
        messages.map((message) =>
          message.id === assistantId
            ? { ...message, error: data?.error || `Chat failed (${res.status})` }
            : message,
        ),
      );
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      updateMessages(conversationId, (messages) =>
        messages.map((message) =>
          message.id === assistantId ? { ...message, error: 'Empty stream from local model' } : message,
        ),
      );
      return;
    }

    const decoder = new TextDecoder();
    let content = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      content += decoder.decode(value, { stream: true });
      const snapshot = content;
      updateMessages(conversationId, (messages) =>
        messages.map((message) => (message.id === assistantId ? { ...message, content: snapshot } : message)),
      );
    }
  }

  async function runImage(
    conversationId: string,
    prompt: string,
    localSettings: LocalSettings,
    initImageDataUrl?: string | null,
  ) {
    const assistantId = newId();
    const usingImg2Img = Boolean(initImageDataUrl);
    updateMessages(conversationId, (messages) => [
      ...messages,
      {
        id: assistantId,
        role: 'assistant',
        content: usingImg2Img
          ? `Running image+style via ${localSettings.imageBackend}…`
          : `Generating image via ${localSettings.imageBackend}…`,
        createdAt: Date.now(),
      },
    ]);

    // Venice cloud generations — no local Forge timeout/cache; still allow a couple of retries.
    const IMAGE_TIMEOUT_MS = VENICE_REQUEST_TIMEOUT_MS;
    const IMAGE_RETRIES = VENICE_MAX_RETRIES;
    const imageBackend = localSettings.imageBackend || 'venice';
    let res: Response | null = null;
    let data: { image?: string; mimeType?: string; mode?: string; error?: string; retryable?: boolean } = {};
    let lastError = 'Image generation failed';

    for (let attempt = 0; attempt <= IMAGE_RETRIES; attempt += 1) {
      try {
        res = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            negative_prompt: localSettings.negativePrompt,
            steps: localSettings.steps,
            cfg_scale: localSettings.cfgScale,
            width: localSettings.width,
            height: localSettings.height,
            model: localSettings.veniceImageModel || undefined,
            mode: usingImg2Img ? 'img2img' : 'txt2img',
            // Omit init_image on txt2img so Venice cannot inherit prior base64.
            ...(usingImg2Img && initImageDataUrl ? { init_image: initImageDataUrl } : {}),
            backend: imageBackend,
            a1111BaseUrl: localSettings.a1111BaseUrl || 'http://127.0.0.1:7860',
            comfyBaseUrl: localSettings.comfyBaseUrl,
          }),
          cache: 'no-store',
          signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
        });
        data = await res.json().catch(() => ({}));
        if (res.ok && typeof data?.image === 'string') break;

        lastError = data?.error || `Image failed (${res.status})`;
        const retryable =
          data?.retryable === true || res.status === 503 || res.status === 504 || res.status >= 500;
        if (!retryable || attempt === IMAGE_RETRIES) {
          updateMessages(conversationId, (messages) =>
            messages.map((message) =>
              message.id === assistantId ? { ...message, content: '', error: lastError } : message,
            ),
          );
          return;
        }
        await new Promise((r) => setTimeout(r, VENICE_RETRY_BASE_DELAY_MS * (attempt + 1)));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Network error';
        lastError = /aborted|timeout/i.test(message)
          ? `Image request timed out after ${IMAGE_TIMEOUT_MS / 1000}s. Try again.`
          : `Image request failed: ${message}`;
        if (attempt === IMAGE_RETRIES) {
          updateMessages(conversationId, (messages) =>
            messages.map((message) =>
              message.id === assistantId ? { ...message, content: '', error: lastError } : message,
            ),
          );
          return;
        }
        await new Promise((r) => setTimeout(r, VENICE_RETRY_BASE_DELAY_MS * (attempt + 1)));
      }
    }

    if (!res?.ok || typeof data?.image !== 'string') {
      updateMessages(conversationId, (messages) =>
        messages.map((message) =>
          message.id === assistantId ? { ...message, content: '', error: lastError } : message,
        ),
      );
      return;
    }

    const mime = typeof data.mimeType === 'string' ? data.mimeType : 'image/png';
    const modeLabel = data?.mode === 'img2img' ? 'img2img' : 'txt2img';
    updateMessages(conversationId, (messages) =>
      messages.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              content: `Image ready (${modeLabel} · ${localSettings.imageBackend}).`,
              imageDataUrl: `data:${mime};base64,${data.image}`,
            }
          : message,
      ),
    );
  }

  if (!settings) {
    return <div className="grid h-full place-items-center text-sm text-mist-500">Loading local workspace…</div>;
  }

  return (
    <div className="flex h-full min-h-0">
      <div className={`fixed inset-y-0 left-0 z-40 w-72 transform transition md:static md:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={(id) => {
            setActiveId(id);
            setMobileNav(false);
          }}
          onNew={() => {
            createConversation();
            setMobileNav(false);
          }}
          onDelete={(id) => {
            setConversations((current) => current.filter((item) => item.id !== id));
            if (activeId === id) setActiveId(null);
          }}
          onOpenSettings={() => {
            setSettingsOpen(true);
            setMobileNav(false);
          }}
        />
      </div>
      {mobileNav && (
        <button type="button" className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setMobileNav(false)} aria-label="Close sidebar" />
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <button type="button" className="rounded-lg border border-white/10 px-2 py-1 text-sm md:hidden" onClick={() => setMobileNav(true)}>
              Menu
            </button>
            <div>
              <p className="text-sm font-semibold">{active?.title || 'New chat'}</p>
              <p className="text-[11px] text-mist-500">
                {settings.model || 'No model selected'} · {settings.textBackend} / {settings.imageBackend}
              </p>
            </div>
          </div>
          <button type="button" onClick={() => setSettingsOpen(true)} className="rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5">
            Settings
          </button>
        </header>

        <ChatBox
          messages={active?.messages ?? []}
          mode={mode}
          busy={busy}
          draft={draft}
          sourceImage={sourceImage}
          onDraftChange={setDraft}
          onModeChange={setMode}
          onSourceImageChange={setSourceImage}
          onSubmit={() => void submit()}
        />
      </main>

      <Settings
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onChange={setSettings}
      />
    </div>
  );
}
