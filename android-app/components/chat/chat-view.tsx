'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { MessageBubble } from './message-bubble';
import { MessageInput } from './message-input';
import { ContextBar } from './context-bar';
import { GenerationPanel } from './generation-panel';
import { TypingIndicator } from './typing-indicator';
import { estimateTokens, countSystemTokens, countHistoryTokens } from '@/lib/tokens';
import { spliceDeletedMessages } from '@/lib/llm/messages';
import { PROVIDER_MODELS, CONTEXT_WINDOWS, DEFAULT_PROVIDER, DEFAULT_MODEL, normalizeProvider, usableCustomModel, usableGeminiModel, MeterDef, MeterSnapshot, GenSettings, ChatMessage } from '@/lib/types';
import { Plus, Pencil, SlidersHorizontal, MoreVertical, KeyRound, Brain, CreditCard, UserRound, Check } from 'lucide-react';
import { applyScripts, fillMacros, pickPersona, type PersonaData, type ScriptData } from '@/lib/hubs';
import { cardFirstMessage, composeOpening } from '@/lib/opening';
import { stripPromptLeak } from '@/lib/prompt-leak';
import { readLastPersonaId, suggestPersonaId, writeLastPersonaId } from '@/lib/persona-choice';
import { PersonaGate } from '@/components/chat/persona-gate';
import { PersonaEditor } from '@/components/chat/persona-editor';
import { compilePerceivedAppearance } from '@/lib/persona-appearance';
import { useAccess } from '@/components/billing/access-provider';
import { RichContent } from '@/components/editor/rich-content';
import { htmlToPlainText } from '@/lib/rich-text';
import { TIERS, isProModel } from '@/lib/tiers';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AppHeader } from '@/components/layout/app-header';
import { CharacterAvatar } from '@/components/character/character-avatar';
import { CharacterAudioPlayer } from '@/components/character/CharacterAudioPlayer';
import { usePersonaName } from '@/lib/persona';
import { toast } from 'sonner';
import Link from 'next/link';
// Mirrors lib/payload-router: compressed system prompt ≤ ~500 tokens, last 5 turns (10 messages) re-sent.
const SYSTEM_PROMPT_ESTIMATE_CAP = 500;
const BASELINE_HISTORY_TURNS = 5;

interface CharacterData {
  id: string;
  name: string;
  summary: string;
  creatorNotes?: string;
  personality: string;
  scenario: string;
  initialMessage: string;
  firstMessage?: string;
  exampleDialogue: string;
  customRules: string;
  systemPrompt: string;
tags:string[];
  avatar: string | null;
  nsfw: boolean;
  ownerId?: string | null;
  audioUrl?: string | null;
}

interface ChatViewProps {
  characterId: string;
}

function localAssistant(sessionId: string, content: string, model: string | null, index: number): ChatMessage {
  return {
    id: `local-ai-${Date.now()}-${index}`,
    sessionId,
    role: 'ASSISTANT',
    content,
    model,
    tokenCount: estimateTokens(content),
    editHistory: [],
    createdAt: new Date().toISOString(),
    index,
  };
}

function sameLine(left: ChatMessage, right: ChatMessage): boolean {
  return left.id === right.id && left.role === right.role && left.content === right.content;
}

/** Drop only exact repeats. Two different lines that share an id stay, and the list key adds their position. */
function dedupeIdentical(list: ChatMessage[]): ChatMessage[] {
  const seen: ChatMessage[] = [];
  for (const message of spliceDeletedMessages(list)) {
    if (!message?.id) continue;
    if (seen.some((kept) => sameLine(kept, message))) continue;
    seen.push(message);
  }
  return seen;
}

function isOptimisticUser(message: ChatMessage, content: string): boolean {
  return message.role === 'USER' && message.content === content && (message.id.startsWith('temp-') || message.id.startsWith('local-'));
}

/** Keep the optimistic user line, swap in the saved row when the reload is a real message list, and keep streamed text if the assistant row is missing. */
function mergeSavedMessages(
  current: ChatMessage[],
  incoming: unknown,
  saved: { id: string; sessionId: string; content: string; model: string | null; streamed: string },
): ChatMessage[] {
  const userRow = [...current].reverse().find((m) => m.id === saved.id || isOptimisticUser(m, saved.content));
  const keptUser: ChatMessage = {
    ...(userRow ?? {
      id: saved.id,
      sessionId: saved.sessionId,
      role: 'USER',
      content: saved.content,
      model: saved.model,
      tokenCount: estimateTokens(saved.content),
      editHistory: [],
      createdAt: new Date().toISOString(),
      index: current.length,
    }),
    id: saved.id,
    content: saved.content,
  };
  const claimSavedId = (list: ChatMessage[]) => {
    if (list.some((m) => m.id === saved.id)) return list;
    let claimed = false;
    const next = [...list].reverse().map((message) => {
      if (claimed || !isOptimisticUser(message, saved.content)) return message;
      claimed = true;
      return { ...message, id: saved.id, content: saved.content };
    }).reverse();
    return claimed ? next : [...next, keptUser];
  };
  const withStream = (list: ChatMessage[]) => {
    const text = saved.streamed.trim();
    const userAt = list.findIndex((m) => m.id === saved.id);
    const assistantAfter = userAt >= 0 && list.slice(userAt + 1).some((m) => m.role === 'ASSISTANT' && m.content.trim());
    if (!text || assistantAfter || list.some((m) => m.role === 'ASSISTANT' && m.content.trim() === text)) return dedupeIdentical(list);
    return dedupeIdentical([...list, localAssistant(saved.sessionId, saved.streamed, saved.model, list.length)]);
  };

  if (!Array.isArray(incoming)) return withStream(claimSavedId(spliceDeletedMessages(current)));
  const server = spliceDeletedMessages(incoming as ChatMessage[]).filter((m) => m && typeof m.id === 'string' && typeof m.content === 'string');
  if (server.length === 0 && current.length > 0) return withStream(claimSavedId(current));
  return withStream(claimSavedId(server));
}

export function ChatView({ characterId }: ChatViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionIdParam = searchParams?.get('session');

  const [character, setCharacter] = useState<CharacterData | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(sessionIdParam ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const setActiveMessages = useCallback((update: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setMessages((prev) => {
      const base = spliceDeletedMessages(prev ?? []);
      const next = typeof update === 'function' ? update(base) : update;
      return spliceDeletedMessages(next ?? []);
    });
  }, []);
  const [meterStates, setMeterStates] = useState<Record<number, MeterSnapshot>>({});
  const [meters, setMeters] = useState<MeterDef[]>([]);
  const [genSettings, setGenSettings] = useState<Partial<GenSettings>>({});
  const [currentModel, setCurrentModel] = useState<string>(DEFAULT_MODEL);
  const [currentProvider, setCurrentProvider] = useState<string>(DEFAULT_PROVIDER);
  // What the server actually sent on the last request (compressed system prompt size + plan cap).
  const [payloadInfo, setPayloadInfo] = useState<{ systemTokens: number; contextCap: number | null } | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [modelNotice, setModelNotice] = useState<string | null>(null);
  const [streamContent, setStreamContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<'memory' | 'generation'>('memory');
  const openDetails = (tab: 'memory' | 'generation') => {
    setDetailsTab(tab);
    setDetailsOpen(true);
  };
  const [personaName] = usePersonaName();
  const [personas, setPersonas] = useState<PersonaData[]>([]);
  const [personasReady, setPersonasReady] = useState(false);
  const [scripts, setScripts] = useState<ScriptData[]>([]);
  const [sessionPersonaId, setSessionPersonaId] = useState<string | null>(null);
  const [chooser, setChooser] = useState(!sessionIdParam);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [recentSessionId, setRecentSessionId] = useState<string | null>(null);
  const [startingChat, setStartingChat] = useState(false);
  const [editingPersona, setEditingPersona] = useState<PersonaData | null>(null);
  const activePersona = pickPersona(personas, characterId, sessionPersonaId);
  const userDisplayName = activePersona?.name || personaName;
  const [visualContext, setVisualContext] = useState('');
  useEffect(() => {
    setVisualContext(activePersona ? compilePerceivedAppearance(activePersona) : '');
  }, [activePersona]);
  const displayTransform = useCallback((t: string) => applyScripts(t, scripts, 'DISPLAY'), [scripts]);

  useEffect(() => {
    let cancel = false;
    setPersonasReady(false);
    Promise.all([
      fetch('/api/personas').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/scripts').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/sessions').then((r) => (r.ok ? r.json() : [])),
    ]).then(([personaRows, scriptRows, sessionRows]) => {
      if (cancel) return;
      const list: PersonaData[] = Array.isArray(personaRows) ? personaRows : [];
      setPersonas(list);
      setScripts(Array.isArray(scriptRows) ? scriptRows : []);
      const lastFromAccount = Array.isArray(sessionRows)
        ? sessionRows.find((session) => typeof session?.personaId === 'string' && session.personaId)?.personaId ?? null
        : null;
      setSelectedPersonaId(suggestPersonaId(list, characterId, readLastPersonaId() || lastFromAccount));
      setPersonasReady(true);
    }).catch(() => { if (!cancel) setPersonasReady(true); });
    return () => { cancel = true; };
  }, [characterId]);

  async function switchPersona(personaId: string | null) {
    if (!sessionId) return;
    const previous = sessionPersonaId;
    const previousContext = visualContext;
    const chosen = personaId ? personas.find((p) => p.id === personaId) : pickPersona(personas, characterId, null);
    setSessionPersonaId(personaId);
    setVisualContext(chosen ? compilePerceivedAppearance(chosen) : '');
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'Could not switch persona');
      if (personaId) writeLastPersonaId(personaId);
      toast.success(chosen ? `Now chatting as ${chosen.name}. The next reply uses this persona.` : 'Using your default persona');
    } catch (err: any) {
      console.error('Persona switch failed:', err);
      setSessionPersonaId(previous);
      setVisualContext(previousContext);
      toast.error(err?.message ?? 'Could not switch persona');
    }
  }
  const { status: access, refresh: refreshAccess, openPaywall } = useAccess();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef?.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, []);

  // Load character
  useEffect(() => {
    fetch(`/api/characters/${characterId}`, { cache: 'no-store' })
      .then(async r => {
        if (r.status === 403) {
          // NSFW character and the viewer isn't a subscriber: prompt an upgrade and leave.
          openPaywall('nsfw');
          router.replace('/');
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data: any) => {
        if (data) {
          const firstMessage = cardFirstMessage(data);
          setCharacter({ ...data, initialMessage: firstMessage, firstMessage });
          try {
            const rules = JSON.parse(data?.customRules ?? '{}');
            setMeters(rules?.meters ?? []);
          } catch { setMeters([]); }
        }
      })
      .catch(() => toast.error('Failed to load character'));
  }, [characterId]);

  useEffect(() => {
    setChooser(!sessionIdParam);
  }, [characterId, sessionIdParam]);

  // Load an existing session. A new chat waits for the persona gate.
  useEffect(() => {
    if (!characterId) return;

    async function initSession() {
      if (!sessionIdParam) {
        try {
          const res = await fetch(`/api/sessions?characterId=${characterId}`);
          const sessions = await res.json();
          const recent = Array.isArray(sessions) ? sessions.find((session) => (session?._count?.messages ?? 0) > 0) ?? null : null;
          if (recent?.id) {
            setRecentSessionId(recent.id);
            router.replace(`/characters/${characterId}/chat?session=${recent.id}`);
            return;
          }
          setRecentSessionId(null);
        } catch {
          setRecentSessionId(null);
        }
        setSessionId(null);
        setActiveMessages([]);
        setLoading(false);
        return;
      }

      const sid = sessionIdParam;
      setSessionId(sid);

      // Load session data
      try {
        const res = await fetch(`/api/sessions/${sid}`, { cache: 'no-store' });
        const session = await res.json();
        const incoming = Array.isArray(session?.messages) ? session.messages : [];
        setActiveMessages(dedupeIdentical(incoming));
        setSessionPersonaId(session?.personaId ?? null);
        const prov = normalizeProvider(session?.provider);
        setCurrentProvider(prov);
        const savedModel = usableCustomModel(session?.model);
        setCurrentModel(prov === DEFAULT_PROVIDER ? usableGeminiModel(savedModel) : savedModel);
        if (session?.generationSettings) {
          setGenSettings(session.generationSettings);
        }
        // Load meter states
        const mStates: Record<number, MeterSnapshot> = {};
        for (const ms of (session?.meterStates ?? [])) {
          mStates[ms.messageIndex] = ms.metersJson as MeterSnapshot;
        }
        setMeterStates(mStates);
      } catch {
        toast.error('Failed to load session');
      }
      setLoading(false);
    }

    initSession();
  }, [characterId, sessionIdParam, router]);

  // Before a session exists, preview the card's first message. A created session uses only the greeting stored for that session.
  useEffect(() => {
    if (loading || !character || streaming || sessionId || sessionIdParam) return;
    const content = stripPromptLeak(composeOpening(character, userDisplayName || 'You'));
    if (!content) return;
    setActiveMessages((prev) => {
      if (prev.length > 0) return prev;
      return [{
        id: `greeting-${character.id}`,
        sessionId: sessionId ?? '',
        role: 'ASSISTANT',
        content,
        model: null,
        tokenCount: 0,
        editHistory: [],
        createdAt: new Date().toISOString(),
        index: 0,
      }];
    });
  }, [loading, character, sessionId, sessionIdParam, userDisplayName, streaming]);

  useEffect(() => { scrollToBottom(); }, [messages, streamContent, scrollToBottom]);

  useEffect(() => {
    let cancel = false;
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancel || !data) return;
        const llm = data?.checks?.llm;
        const ready = typeof llm === 'boolean' ? llm : llm?.ok;
        if (ready === false) setModelNotice(typeof llm?.detail === 'string' ? llm.detail : 'No model key is saved.');
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, []);

  // Save generation settings
  async function saveGenSettings(newSettings: Partial<GenSettings>) {
    setGenSettings(newSettings);
    if (!sessionId) return;
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationSettings: newSettings }),
      });
    } catch {}
  }

  // Send message. The typed line stays in the thread if the model or the route fails.
  async function handleSend(content: string): Promise<boolean> {
    if (!sessionId || streaming) return false;

    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      sessionId: sessionId,
      role: 'USER',
      content,
      model: currentModel,
      tokenCount: estimateTokens(content),
      editHistory: [],
      createdAt: new Date().toISOString(),
      index: spliceDeletedMessages(messages ?? []).length,
    };
    setActiveMessages(prev => [...(prev ?? []), userMsg]);
    setStreaming(true);
    setStreamContent('');
    let fullText = '';
    let savedUserId = userMsg.id;

    const keepUserMessage = () => {
      setActiveMessages((prev) => mergeSavedMessages(prev ?? [], null, {
        id: savedUserId,
        sessionId,
        content,
        model: currentModel,
        streamed: fullText,
      }));
    };

    try {
      let res: Response | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          res = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              content,
              model: currentModel,
              personaId: sessionPersonaId,
            }),
          });
        } catch (networkErr) {
          console.error('Chat stream failed', networkErr);
          if (attempt === 0) {
            toast.message('The connection dropped. Your message is still here. Retrying.');
            await new Promise((resolve) => setTimeout(resolve, 700));
            continue;
          }
          keepUserMessage();
          toast.error('The reply connection dropped. Your message is still in this chat.');
          return true;
        }
        if (res.ok || res.status !== 503 || attempt === 1) break;
        toast.message('The reply queue was busy. Your message is still here. Retrying.');
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      if (!res) {
        keepUserMessage();
        toast.error('The reply connection dropped. Your message is still in this chat.');
        return true;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        savedUserId = res.headers.get('X-User-Message-Id') || userMsg.id;
        keepUserMessage();
        const notice = typeof err?.error === 'string' ? err.error : 'The reply failed. Your message is still in this chat.';
        if (res.status === 402 && err?.code === 'OUT_OF_CREDITS') {
          openPaywall('credits');
        } else if (res.status === 402 && err?.feature === 'proModels') {
          openPaywall('proModels');
        } else if (res.status === 403 && err?.code === 'NSFW_LOCKED') {
          openPaywall('nsfw');
        } else if (res.status === 401) {
          router.push(`/login?callbackUrl=${encodeURIComponent(`/characters/${characterId}/chat`)}`);
        } else if (res.status === 400 && notice.includes('API key')) {
          setModelNotice(notice);
          toast.error(notice);
        } else {
          toast.error(notice);
        }
        return true;
      }

      savedUserId = res.headers.get('X-User-Message-Id') || userMsg.id;
      if (savedUserId !== userMsg.id) {
        setActiveMessages((prev) => (prev ?? []).map((m: ChatMessage) => m.id === userMsg.id ? { ...m, id: savedUserId } : m));
      }

      // Sync with the provider/model the server actually used
      const usedProvider = res.headers.get('X-Provider');
      const usedModel = res.headers.get('X-Model');
      if (usedProvider) setCurrentProvider(usedProvider);
      if (usedModel) setCurrentModel(usedModel);
      if (res.headers.get('X-Model-Downgraded') === '1') {
        toast.message('Pro models are on Premium. This reply used the standard model.');
      }
      const sentSystem = Number(res.headers.get('X-Payload-System-Tokens'));
      const sentCap = Number(res.headers.get('X-Payload-Context-Cap'));
      if (sentSystem > 0) setPayloadInfo({ systemTokens: sentSystem, contextCap: sentCap > 0 ? sentCap : null });

      const reader = res?.body?.getReader();
      if (!reader) {
        keepUserMessage();
        toast.error('The reply connection dropped. Your message is still in this chat.');
        return true;
      }
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setStreamContent(fullText);
      }

      // Replace the temporary line with the row saved before the stream, and keep the reply if the reload misses it.
      try {
        const msgsRes = await fetch(`/api/sessions/${sessionId}/messages`);
        const allMsgs = msgsRes.ok ? await msgsRes.json() : null;
        if (!msgsRes.ok || !Array.isArray(allMsgs)) {
          console.error('Chat history reload failed', msgsRes.status, allMsgs);
        }
        setActiveMessages((prev) => mergeSavedMessages(prev ?? [], allMsgs, {
          id: savedUserId,
          sessionId,
          content,
          model: usedModel || currentModel,
          streamed: fullText,
        }));
        // Reload meter states
        const sessRes = await fetch(`/api/sessions/${sessionId}`);
        const sessData = await sessRes.json();
        const mStates: Record<number, MeterSnapshot> = {};
        for (const ms of (sessData?.meterStates ?? [])) {
          mStates[ms.messageIndex] = ms.metersJson as MeterSnapshot;
        }
        setMeterStates(mStates);
      } catch (reloadErr) {
        console.error('Failed to reload chat messages', reloadErr);
        keepUserMessage();
        toast.message('The thread could not refresh. Your message is still on screen.');
      }
      return true;
    } catch (err: any) {
      console.error('Chat stream failed', err);
      keepUserMessage();
      toast.error('The reply connection dropped. Your message is still in this chat.');
      return true;
    } finally {
      setStreaming(false);
      setStreamContent('');
      void refreshAccess();
    }
  }

  // Message actions
  async function handleEdit(messageId: string, newContent: string) {
    if (!sessionId) return;
    try {
      await fetch(`/api/sessions/${sessionId}/messages`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, content: newContent }),
      });
      setActiveMessages(prev => (prev ?? []).map((m: ChatMessage) => m.id === messageId ? { ...m, content: newContent } : m));
      toast.success('Message edited');
    } catch {
      toast.error('Failed to edit message');
    }
  }

  async function handleDelete(messageId: string) {
    if (!sessionId) return;
    try {
      await fetch(`/api/sessions/${sessionId}/messages?messageId=${messageId}`, { method: 'DELETE' });
      setActiveMessages(prev => (prev ?? []).filter((m: ChatMessage) => m.id !== messageId));
      toast.success('Message deleted');
    } catch {
      toast.error('Failed to delete message');
    }
  }

  async function handleBranch(messageIndex: number) {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIndex }),
      });
      const newSession = await res.json();
      toast.success('Session branched!');
      router.push(`/characters/${characterId}/chat?session=${newSession?.id}`);
    } catch {
      toast.error('Failed to branch');
    }
  }

  async function handleRegenerate() {
    if (!sessionId || streaming) return;
    // Remove last AI message and resend last user message
    const safeMessages = spliceDeletedMessages(messages ?? []);
    const lastAi = [...safeMessages].reverse().find((m: ChatMessage) => m.role === 'ASSISTANT');
    const lastUser = [...safeMessages].reverse().find((m: ChatMessage) => m.role === 'USER');
    if (lastAi) {
      await handleDelete(lastAi.id);
    }
    if (lastUser) {
      handleSend(lastUser.content);
    }
  }

  function handleNewSession() {
    setChooser(true);
  }

  async function beginChat(personaId: string | null) {
    setStartingChat(true);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, personaId }),
      });
      const session = await res.json().catch(() => ({}));
      if (!res.ok || !session?.id) throw new Error(session?.error ?? 'Failed to start chat');
      if (personaId) writeLastPersonaId(personaId);
      setActiveMessages(Array.isArray(session.messages) ? session.messages : []);
      setSessionPersonaId(personaId);
      setChooser(false);
      router.replace(`/characters/${characterId}/chat?session=${session.id}`);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to start chat');
    } finally {
      setStartingChat(false);
    }
  }

  function continueRecent() {
    if (!recentSessionId) return;
    setChooser(false);
    router.replace(`/characters/${characterId}/chat?session=${recentSessionId}`);
  }

  async function refreshPersona(saved: PersonaData) {
    setPersonas((current) => current.map((persona) => (persona.id === saved.id ? saved : persona)));
    setEditingPersona(null);
    if (sessionId && (sessionPersonaId === saved.id || activePersona?.id === saved.id)) {
      writeLastPersonaId(saved.id);
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: saved.id }),
      }).catch(() => {});
    }
  }

  async function handleModelChange(model: string) {
    if (isProModel(model) && !access?.can.proModels) {
      openPaywall('proModels');
      return;
    }
    const previous = currentModel;
    setCurrentModel(model);
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setCurrentModel(previous);
        if (res.status === 402) openPaywall(err?.feature === 'proModels' ? 'proModels' : 'credits');
        else toast.error(err?.error ?? 'Could not change model');
      }
    } catch {
      setCurrentModel(previous);
      toast.error('Could not change model');
    }
  }

  // Pro models are a Premium+ perk (the server enforces this too).
  const canPro = !!access?.can.proModels;
  const availableModels = (PROVIDER_MODELS?.[currentProvider] ?? []).filter((m: string) => canPro || !isProModel(m));
  const canAdvanced = !!access?.can.advancedGeneration;
  useEffect(() => {
    if (!access || access.can.proModels || !isProModel(currentModel)) return;
    setCurrentModel(DEFAULT_MODEL);
  }, [access, currentModel]);
  const planCap = access?.isAdmin
    ? (CONTEXT_WINDOWS?.[currentModel] ?? 8192)
    : (access?.contextTokens ?? TIERS.FREE.contextTokens);
  // Plan cap (Free 4k / Plus 16k / Premium 32k / Ultimate 64k; admins use the model window).
  // The counter mirrors the request the server actually sends: the compressed system prompt (from the
  // last response, ≤500-token estimate before the first send) plus the last 10 messages. Older history
  // stays on screen but is not re-sent, so it doesn't count against the context window.
  const contextWindow = payloadInfo?.contextCap
    ?? Math.min(CONTEXT_WINDOWS?.[currentModel] ?? planCap, planCap);
  const systemTokens = payloadInfo?.systemTokens
    ?? (character ? Math.min(countSystemTokens({ ...character, exampleDialogue: '' }), SYSTEM_PROMPT_ESTIMATE_CAP) : 0);
  const activeMessages = spliceDeletedMessages(messages ?? []);
  const historyTokens = countHistoryTokens(activeMessages.slice(-BASELINE_HISTORY_TURNS * 2));

  if (loading) {
    return (
      <div className="flex flex-col h-full w-full">
        <AppHeader left={<Skeleton className="h-8 w-40" />} />
        <div className="flex-1 w-full max-w-3xl mx-auto p-4 space-y-4">
          <Skeleton className="h-20 w-3/4" />
          <Skeleton className="h-12 w-1/2 ml-auto" />
          <Skeleton className="h-24 w-3/4" />
        </div>
      </div>
    );
  }

  let prevSnapshot: MeterSnapshot | undefined;

  const characterAudioUrl = character?.audioUrl?.trim() || '';
  const characterTags = (Array.isArray(character?.tags) ? character.tags : String(character?.tags ?? '').split(','))
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 5);

  return (
    <div className="flex flex-col h-full w-full max-w-full overflow-hidden">
      {chooser && (
        <PersonaGate
          characterName={character?.name ?? ''}
          characterId={characterId}
          personas={personas}
          ready={personasReady}
          selectedId={selectedPersonaId}
          onSelect={setSelectedPersonaId}
          recentSessionId={sessionIdParam ? null : recentSessionId}
          starting={startingChat}
          onStart={beginChat}
          onContinue={continueRecent}
          onDismiss={sessionId ? () => setChooser(false) : undefined}
        />
      )}
      <PersonaEditor persona={editingPersona} onClose={() => setEditingPersona(null)} onSaved={refreshPersona} />
      <AppHeader
        left={
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => openDetails('memory')}
              className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left hover:bg-secondary transition-colors"
            >
              <CharacterAvatar src={character?.avatar} name={character?.name} className="h-9 w-9 text-sm ring-2 ring-primary/40" />
              <div className="min-w-0">
                <p className="font-display font-semibold leading-tight truncate">{character?.name ?? 'Character'}</p>
                <p className="text-[11px] text-muted-foreground truncate max-w-[28vw] sm:max-w-md">
                  {htmlToPlainText(character?.summary ?? '').replace(/[#*_`>]/g, '').trim() || currentModel}
                </p>
              </div>
            </button>
          </div>
        }
        right={
          <>
            <span className="sr-only" aria-live="polite">{visualContext ? 'Appearance context is active for this persona.' : ''}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Change Persona" className="gap-1.5 px-2">
                  <CharacterAvatar src={activePersona?.avatar} name={userDisplayName || 'You'} className="h-6 w-6 text-[10px]" />
                  <span className="hidden sm:inline max-w-[9rem] truncate">Change Persona</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Chatting as {userDisplayName || 'You'}</p>
                {personas.length === 0 && (
                  <p className="px-2 pb-2 text-xs text-muted-foreground">No personas yet.</p>
                )}
                {personas.map((p, personaIndex) => (
                  <DropdownMenuItem key={`${p.id}:${personaIndex}`} onSelect={() => switchPersona(p.id)}>
                    <CharacterAvatar src={p.avatar} name={p.name} className="h-6 w-6 text-[10px] mr-2" />
                    <span className="truncate flex-1">{p.name}</span>
                    {activePersona?.id === p.id && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
                {sessionPersonaId && (
                  <DropdownMenuItem onSelect={() => switchPersona(null)}>
                    <UserRound className="h-4 w-4 mr-2" />Use default persona
                  </DropdownMenuItem>
                )}
                {activePersona && (
                  <DropdownMenuItem onSelect={() => setEditingPersona(activePersona)}>
                    <Pencil className="h-4 w-4 mr-2" />Edit this persona
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/personas"><Pencil className="h-4 w-4 mr-2" />Manage personas</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {character && (access?.isCreatorAdmin || (!!access?.userId && character.ownerId === access.userId)) && (
              <Link href={`/characters/${character.id}/edit`} aria-label={`Edit ${character.name}`} title="Edit character">
                <Button variant="ghost" size="sm" className="px-2">
                  <Pencil className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={handleNewSession} aria-label="New chat">
              <Plus className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">New chat</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Chat menu">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {access?.isCreatorAdmin ? (
                  <DropdownMenuItem asChild>
                    <Link href="/settings?tab=api"><KeyRound className="h-4 w-4 mr-2" />API Settings</Link>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem asChild>
                    <Link href="/settings?tab=subscription"><CreditCard className="h-4 w-4 mr-2" />Subscription &amp; Tiers</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => openDetails('memory')}>
                  <Brain className="h-4 w-4 mr-2" />Chat Memory
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openDetails('generation')}>
                  <SlidersHorizontal className="h-4 w-4 mr-2" />Generation Settings
                </DropdownMenuItem>
                {character && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href={`/characters/${character.id}/edit`}><Pencil className="h-4 w-4 mr-2" />Edit character</Link>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <ContextBar systemTokens={systemTokens} historyTokens={historyTokens} maxTokens={contextWindow} />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="w-full max-w-3xl mx-auto py-4">
          {activeMessages.map((msg: ChatMessage, position: number) => {
            const snap = meterStates?.[msg.index];
            const prev = prevSnapshot;
            if (snap) prevSnapshot = snap;
            return (
              <MessageBubble
                key={`${msg.id}:${msg.index}:${position}`}
                id={msg.id}
                role={msg.role}
                content={fillMacros(msg.content, character?.name || 'Character', userDisplayName || 'You')}
                model={msg.model}
                characterName={character?.name}
                characterAvatar={character?.avatar}
                userName={userDisplayName}
                transform={displayTransform}
                meters={meters}
                meterValues={snap}
                previousMeterValues={prev}
                onRegenerate={msg.role === 'ASSISTANT' ? handleRegenerate : undefined}
                onEdit={(newContent: string) => handleEdit(msg.id, newContent)}
                onBranch={() => handleBranch(msg.index)}
                onDelete={() => handleDelete(msg.id)}
              />
            );
          })}

          {streaming && streamContent && (
            <MessageBubble
              key="assistant-stream"
              id="streaming"
              role="ASSISTANT"
              content={streamContent}
              characterName={character?.name}
              characterAvatar={character?.avatar}
              meters={meters}
              transform={displayTransform}
              isStreaming
            />
          )}

          {streaming && !streamContent && <TypingIndicator />}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="w-full max-w-3xl mx-auto sticky bottom-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)]">
        {characterAudioUrl && (
          <div className="mx-3 mb-2 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-card/95 px-3 py-2 shadow-lg">
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">{character?.name ?? 'Character'} soundtrack</p>
              <p className="text-[11px] text-muted-foreground">Pause or mute without leaving chat</p>
            </div>
            <CharacterAudioPlayer audioUrl={characterAudioUrl} label={character?.name ?? 'Character'} autoplay className="shrink-0" />
          </div>
        )}
        {modelNotice && (
          <div className="mx-3 mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            {modelNotice}{' '}
            <Link href="/settings?tab=api" className="font-medium underline">Open API settings</Link>
          </div>
        )}
        <MessageInput
          onSend={handleSend}
          disabled={streaming}
          currentModel={currentModel}
          models={availableModels}
          onModelChange={handleModelChange}
        />
      </div>

      {/* Character details + generation settings */}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm p-0 flex flex-col bg-card">
          <SheetHeader className="p-5 pb-4 border-b border-border text-left">
            <div className="flex items-center gap-3">
              <CharacterAvatar src={character?.avatar} name={character?.name} className="h-14 w-14 text-xl" />
              <div className="min-w-0">
                <SheetTitle className="font-display truncate">{character?.name ?? 'Character'}</SheetTitle>
                {characterTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {characterTags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                )} 
              </div>
            </div>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-1 p-2 mx-5 mt-4 rounded-lg bg-secondary">
            {(['memory', 'generation'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setDetailsTab(tab)}
                className={`rounded-md py-1.5 text-xs font-medium transition-colors ${detailsTab === tab ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {tab === 'memory' ? 'Chat Memory' : 'Generation'}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {detailsTab === 'memory' ? (
            <div className="p-5 space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Context usage</h3>
                <p className="text-sm text-foreground/80">
                  {(systemTokens + historyTokens).toLocaleString('en-US')} / {contextWindow.toLocaleString('en-US')} tokens · {activeMessages.length} messages
                </p>
              </div>
              {character?.scenario && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Scenario</h3>
                  <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{character.scenario}</p>
                </div>
              )}
              {character?.summary && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Character Bio</h3>
                  <RichContent content={character.summary} className="text-sm text-foreground/80" />
                </div>
              )}
              {character?.creatorNotes?.trim() && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Public Description</h3>
                  <RichContent content={character.creatorNotes} className="text-sm text-foreground/80" />
                </div>
              )}
            </div>
            ) : (
              <GenerationPanel
                settings={genSettings}
                onChange={saveGenSettings}
                samplingLocked={!canAdvanced}
                samplingHidden={!canAdvanced && access?.tier === 'FREE'}
                onUpgrade={() => openPaywall('advancedGeneration')}
                defaultExpanded
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
