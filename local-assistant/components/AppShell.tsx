'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChatBox } from './ChatBox';
import { Settings } from './Settings';
import { Sidebar } from './Sidebar';
import { loadConversations, loadSettings, newId, saveConversations, saveSettings } from '@/lib/settings-client';
import type { ChatMessage, Conversation, InputMode, LocalSettings } from '@/lib/types';

export function AppShell() {
  const [settings, setSettings] = useState<LocalSettings | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<InputMode>('text');
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

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
        await runImage(conversationId, prompt, settings);
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

  async function runImage(conversationId: string, prompt: string, localSettings: LocalSettings) {
    const assistantId = newId();
    updateMessages(conversationId, (messages) => [
      ...messages,
      { id: assistantId, role: 'assistant', content: 'Generating image locally…', createdAt: Date.now() },
    ]);

    const res = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        negative_prompt: localSettings.negativePrompt,
        steps: localSettings.steps,
        cfg_scale: localSettings.cfgScale,
        width: localSettings.width,
        height: localSettings.height,
        sampler_name: localSettings.samplerName,
        backend: localSettings.imageBackend,
        a1111BaseUrl: localSettings.a1111BaseUrl,
        comfyBaseUrl: localSettings.comfyBaseUrl,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data?.image !== 'string') {
      updateMessages(conversationId, (messages) =>
        messages.map((message) =>
          message.id === assistantId
            ? { ...message, content: '', error: data?.error || `Image failed (${res.status})` }
            : message,
        ),
      );
      return;
    }

    const mime = typeof data.mimeType === 'string' ? data.mimeType : 'image/png';
    updateMessages(conversationId, (messages) =>
      messages.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              content: 'Image ready.',
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
          onDraftChange={setDraft}
          onModeChange={setMode}
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
