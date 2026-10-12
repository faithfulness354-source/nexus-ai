export const dynamic = "force-dynamic";
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { createLLMStream } from '@/lib/llm/router';
import { resolveChatTarget } from '@/lib/llm/resolve';
import { estimateTokens } from '@/lib/tokens';
import { CONTEXT_WINDOWS, DEFAULT_MODEL } from '@/lib/types';
import { getViewer, can, consumeCredit, refundCredit, canAccessSession, unauthorized, forbidden, canViewNsfw, nsfwLocked } from '@/lib/access';
import { canViewCharacter } from '@/lib/card-visibility';
import { nsfwToggleFromRequest } from '@/lib/nsfw-pref';
import { characterImpliesNsfw } from '@/lib/nsfw-notice';
import { TIERS, isProModel, clampSampling, SAMPLING_LIMITS } from '@/lib/tiers';
import { acquireSlot, laneFor, QueueTimeoutError } from '@/lib/priority-queue';
import { sceneTagsForLLM } from '@/lib/scene-tags';
import { applyScripts, trimIncompleteTail, fillMacros, formatPersona, personaAnchor, pickPersona, selectLore } from '@/lib/hubs';
import { personaDto } from '@/lib/persona-server';
import { unpackList } from '@/lib/hub-server';
import { compilePerceivedAppearance } from '@/lib/persona-appearance';
import { loadImage } from '@/lib/avatar-snapshot';
import { messageContent, sanitizeChatHistory, spliceDeletedMessages, usableImages, type ProviderImage } from '@/lib/llm/messages';
import { listActiveMessages, nextMessageIndex } from '@/lib/llm/active-messages';
import { characterGreeting } from '@/lib/greeting';
import { logEvent } from '@/lib/logger';
import { syncMessageToCloud } from '@/lib/supabase/sync';
import {
  payloadPolicy, minify, compressSystemPrompt, trackedMeters, progressionStatus, parseMeterValues, assembleTierPayload, HISTORY_MESSAGE_LIMIT,
  OUTPUT_FLOOR_TOKENS, OUTPUT_CEILING_TOKENS, buildTieredSystemPrompt, includeExampleDialogue, exampleDialogueBlock,
  summaryPrompt, extractiveSummary, truncateTokens, SUMMARY_BATCH, SUMMARY_TOKEN_LIMIT,
} from '@/lib/payload-router';

function wordList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((word): word is string => typeof word === 'string');
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((word): word is string => typeof word === 'string');
    } catch { /* stored text is not a list */ }
  }
  return [];
}

export async function POST(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  let charged = false;
  let sessionId = '';
  try {
    const body = await request.json();
    const { sessionId: incomingSessionId, content: rawContent, model: overrideModel, personaId: requestedPersonaId } = body ?? {};
    sessionId = String(incomingSessionId ?? '');

    if (!sessionId || !rawContent) {
      return new Response(JSON.stringify({ error: 'sessionId and content required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Load session with character and settings
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        character: true,
        generationSettings: true,
      },
    });

    if (!session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!canAccessSession(viewer, session)) return forbidden('This chat belongs to another account.');
    if (session.character && !canViewCharacter({ isCreatorAdmin: viewer.isCreatorAdmin, userId: viewer.user.id }, session.character)) {
      return new Response(JSON.stringify({ error: 'This character is not available.' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    if (session.character && (session.character.nsfw || characterImpliesNsfw(session.character)) && !(nsfwToggleFromRequest(request) && canViewNsfw(viewer))) return nsfwLocked();

    // Daily credits: 1 credit = 1 text message. Admins and unlimited tiers always pass.
    if (!(await consumeCredit(viewer))) {
      const limit = TIERS[viewer.tier].dailyCredits;
      return new Response(JSON.stringify({
        error: `You've used all ${limit} daily credits on the ${TIERS[viewer.tier].name} plan.`,
        code: 'OUT_OF_CREDITS',
        tier: viewer.tier,
      }), { status: 402, headers: { 'Content-Type': 'application/json' } });
    }
    charged = true;

    const character = session.character;

    // Viewer's management hubs: personas, lorebooks and custom scripts.
    const userId = viewer.user.id;
    // Plan-capped payload routing (4k/16k/32k/64k), fixed 250–350 token output band for every tier.
    const policy = payloadPolicy(viewer.tier, viewer.isAdmin, CONTEXT_WINDOWS?.[overrideModel ?? session.model] ?? null);
    const [personas, lorebooks, scripts, lastMeter] = await Promise.all([
      prisma.persona.findMany({ where: { userId } }),
      policy.lore && can(viewer, 'customPrompts')
        ? prisma.lorebook.findMany({ where: { userId, enabled: true }, include: { entries: true } })
        : Promise.resolve([]),
      prisma.userScript.findMany({ where: { userId, enabled: true } }),
      prisma.meterState.findFirst({ where: { sessionId }, orderBy: { messageIndex: 'desc' } }),
    ]);
    const personaChoice = typeof requestedPersonaId === 'string' && requestedPersonaId.trim()
      ? requestedPersonaId.trim()
      : session.personaId;
    const persona = pickPersona(personas.map(personaDto), session.characterId, personaChoice);
    const userName = persona?.name?.trim() || 'User';
    const charName = character?.name || 'Character';
    // Pre-response scripts rewrite the user's message before it is saved and sent.
    const content = applyScripts(String(rawContent), scripts, 'PRE').trim() || String(rawContent);
    // Advanced sampling (temperature/top-p/penalties) is a Premium+ feature; others use defaults.
    const genSettings = can(viewer, 'advancedGeneration')
      ? session.generationSettings && {
          ...session.generationSettings,
          temperature: clampSampling('temperature', session.generationSettings.temperature) ?? SAMPLING_LIMITS.temperature.default,
          topP: clampSampling('topP', session.generationSettings.topP) ?? SAMPLING_LIMITS.topP.default,
        }
      : session.generationSettings
        ? { ...session.generationSettings, temperature: 0.8, topP: 0.95, frequencyPenalty: 0, presencePenalty: 0 }
        : null;
    const llmSettings = { ...(genSettings ?? {}), maxTokens: policy.maxOutputTokens };
    const requestedModel = overrideModel ?? session.model;
    const modelDowngraded = isProModel(requestedModel) && !can(viewer, 'proModels');
    const allowedModel = modelDowngraded ? DEFAULT_MODEL : requestedModel;

    // Persist the user's line before any model response, including a rejected key or a failed stream.
    const storedMessages = await listActiveMessages(sessionId);
    const nextIndex = await nextMessageIndex(sessionId);
    const savedUserMessage = await prisma.message.create({
      data: {
        sessionId,
        role: 'USER',
        content,
        model: allowedModel,
        tokenCount: estimateTokens(content),
        index: nextIndex,
      },
    });
    void syncMessageToCloud(savedUserMessage, viewer.user);

    // Resolve provider/model and automatically load the saved key (Google Gemini by default)
    const target = await resolveChatTarget(session.provider, allowedModel);
    if (!target) {
      await refundCredit(viewer);
      return new Response(JSON.stringify({ error: 'No active API key. Open Settings → API to add a key or turn the provider back on.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'X-User-Message-Id': savedUserMessage.id },
      });
    }
    const provider = target.provider;
    const useModel = target.model;
    const providerConfig = target.config;

    // Authority directive, user persona, and character definition stay on every turn.
    // Example dialogue is attached only while the thread is still under four messages.
    const meters = trackedMeters(character?.customRules);
    const latestMeters = (lastMeter?.metersJson ?? null) as Record<string, number> | null;
    const conversationLength = storedMessages.length + 1;
    const characterParts: string[] = [
      compressSystemPrompt({
        name: charName, title: character?.title, personality: character?.personality, systemPrompt: character?.systemPrompt,
        summary: character?.summary, scenario: character?.scenario, customRules: character?.customRules,
      }),
    ];
    if (includeExampleDialogue(conversationLength)) {
      const examples = exampleDialogueBlock(character?.exampleDialogue, [
        character?.systemPrompt,
        character?.personality,
      ]);
      if (examples) characterParts.push(examples);
    }
    const contextParts: string[] = [];
    // Facts from turns that slid out of the 10-message window, so established canon is never lost.
    if (session.memorySummary?.trim()) contextParts.push(`Story so far (canon): ${minify(session.memorySummary)}`);
    if (policy.imageTriggers && character?.sceneImages && can(viewer, 'sceneImages')) {
      contextParts.push([
        'Scene illustrations: when a reply reaches a visually striking moment, you may add ONE image block on its own line at the end of the reply, after the action text, in exactly this format: [GENERATE_IMAGE: short action and place]. Use it at most once per reply.',
        'Write one short clause for what is happening and where. Do not describe face, hair, eyes, skin, body, clothing, camera, lighting, or art style. The card portrait already locks the look.',
      ].join(' '));
    }
    const priorCount = storedMessages.length;
    const openingTurn = priorCount <= 1;
    const lastMessageAt = storedMessages.at(-1)?.createdAt;
    // A persona switch or edit bumps the session after the last stored message. The next turn reloads identity and keeps history.
    const personaRefresh = !openingTurn && !!lastMessageAt && session.updatedAt > lastMessageAt;
    let personaImages: ProviderImage[] = [];
    if (persona?.avatar) {
      try {
        const portrait = await loadImage(persona.avatar);
        if (portrait) personaImages = usableImages([{ mimeType: portrait.mime, data: portrait.data }]);
      } catch { /* a missing portrait stays text-only and must not reject the turn */ }
    }
    const personaParts: string[] = [];
    if (persona) {
      personaParts.push(compilePerceivedAppearance(persona));
      const notes = formatPersona(persona);
      personaParts.push([
        `The user plays {{user}} (${personaAnchor(persona)}).`,
        'You can see their appearance and you know their traits and background.',
        personaImages.length ? 'Their latest message includes a portrait. That image is what {{user}} looks like right now.' : '',
        'Let those details change what you notice, how you address them, and how you react.',
        'Never speak, decide, or act for them.',
        notes ? truncateTokens(notes, 280) : '',
      ].filter(Boolean).join(' '));
      if (personaRefresh) personaParts.push(`Persona update: {{user}} is now ${personaAnchor(persona)}. Continue this same conversation and do not restart the scene.`);
    }
    const greeting = character ? characterGreeting(character, userName) : '';
    if (openingTurn && greeting) {
      contextParts.push(`Opening line already shown to {{user}}. Do not repeat it: ${truncateTokens(greeting, 120)}`);
    }
    const books = lorebooks.filter((b) =>
      b.scope === 'GLOBAL' ||
      (b.scope === 'CHARACTER' && unpackList(b.characterIds).includes(session.characterId)) ||
      (b.scope === 'PERSONA' && !!persona && unpackList(b.personaIds).includes(persona.id)));
    if (books.length) {
      const recent = [...storedMessages.slice(-50).map((m) => m.content), content];
      const lore = selectLore(books.flatMap((b) => b.entries.map((entry) => ({ ...entry, keys: unpackList(entry.keys) }))), recent);
      // Lore is capped at 15% of the plan context so it never crowds out the conversation window.
      if (lore.length) contextParts.push(truncateTokens(`World lore (relevant entries): ${lore.map((e) => `${e.title ? `${e.title}: ` : ''}${e.content.trim()}`).join(' | ')}`, Math.floor(policy.contextCap * 0.15)));
    }
    if (can(viewer, 'customPrompts')) {
      const prompts = scripts.filter((s) => s.kind === 'PROMPT' && s.promptText.trim()).sort((a, b) => a.order - b.order);
      if (prompts.length) contextParts.push(truncateTokens(prompts.map((s) => s.promptText.trim()).join(' '), Math.floor(policy.contextCap * 0.1)));
    }
    // Live tracker goes last so it is the freshest instruction the model reads before writing.
    contextParts.push(progressionStatus(meters, latestMeters, storedMessages.length + 1));
    contextParts.push(`Reply length: at least four paragraphs, about ${OUTPUT_FLOOR_TOKENS}-${OUTPUT_CEILING_TOKENS} tokens, then the status line. A one to five line reply is too short. Finish the beat with action, spoken lines, and how {{char}} reacts.`);
    const fill = (parts: string[]) => minify(fillMacros(parts.filter(Boolean).join(' '), charName, userName));
    const systemPrompt = buildTieredSystemPrompt({
      persona: fill(personaParts),
      character: fill(characterParts),
      context: fill(contextParts),
    });

    // Only the newest messages are prepared for the model. The full thread stays in the database and the UI.
    const liveStored = spliceDeletedMessages(storedMessages);
    const recentStored = liveStored.slice(-(HISTORY_MESSAGE_LIMIT - 1));
    const greetingText = greeting.trim();
    const historyForModel = sanitizeChatHistory(
      recentStored
        .filter((m) => !(greetingText && m.role === 'ASSISTANT' && messageContent(m.content).trim() === greetingText))
        .map((m) => ({ role: m.role, content: sceneTagsForLLM(messageContent(m.content)) })),
    );
    const allMessages = sanitizeChatHistory([
      ...liveStored.map((m) => ({ role: m.role, content: m.content, deleted: m.deleted })),
      { role: 'user', content },
    ]);
    const payload = assembleTierPayload(systemPrompt, [...historyForModel, { role: 'user', content: messageContent(content) }], policy);
    const contextMessages = payload.messages;
    const inputTokens = payload.inputTokens;

    // Persist the resolved provider/model so the session stays in sync
    if (useModel !== session.model || provider !== session.provider) {
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { model: useModel, provider },
      });
    }

    // Plan routing queue: Free = standard, Plus = fast, Premium = priority, Ultimate/admin = top priority.
    const lane = laneFor(viewer.tier, viewer.isAdmin);
    let slot: Awaited<ReturnType<typeof acquireSlot>>;
    try {
      slot = await acquireSlot(lane);
    } catch (qErr) {
      if (qErr instanceof QueueTimeoutError) {
        await prisma.message.deleteMany({ where: { sessionId, index: nextIndex, role: 'USER' } }).catch(() => {});
        await refundCredit(viewer).catch(() => {});
        return new Response(JSON.stringify({ error: qErr.message, code: 'QUEUE_BUSY' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
      throw qErr;
    }
    const releaseSlot = slot.release;

    // Create LLM stream
    let llmStream: ReadableStream<Uint8Array>;
    try {
      llmStream = createLLMStream({
      messages: contextMessages,
      model: useModel,
      provider,
      config: providerConfig as any,
      settings: llmSettings as any,
      forbiddenWords: wordList(genSettings?.forbiddenWords),
      images: personaImages,
      });
    } catch (e) {
      releaseSlot();
      throw e;
    }

    // Transform: collect full response and save to DB after stream ends
    const reader = llmStream.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    const responseStream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            releaseSlot();
            // Save assistant message to DB (post-response scripts run first)
            try {
              const finalResponse = trimIncompleteTail(applyScripts(fullResponse, scripts, 'POST'));
              const savedAssistant = await prisma.message.create({
                data: {
                  sessionId,
                  role: 'ASSISTANT',
                  content: finalResponse,
                  model: useModel,
                  tokenCount: estimateTokens(finalResponse),
                  index: nextIndex + 1,
                },
              });
              void syncMessageToCloud(savedAssistant, viewer.user);

              // Rolling memory: fold messages that fell out of the raw window into the session summary.
              if (policy.memorySummary) {
                const finished = [...allMessages, { role: 'assistant', content: finalResponse }];
                void updateRollingSummary(sessionId, finished, session.memorySummary ?? '', session.memorySummaryUpTo ?? 0,
                  policy.historyTurns * 2, { provider, model: useModel, config: providerConfig }, charName, userName);
              }

              // Progression tracker: Heat (0–5) + custom meters, carried over when the reply omits a value.
              if (policy.statusTracking) try {
                await prisma.meterState.create({
                  data: {
                    sessionId,
                    messageIndex: nextIndex + 1,
                    metersJson: parseMeterValues(fullResponse, meters, latestMeters),
                  },
                });
              } catch { /* skip meter parsing errors */ }
            } catch (saveErr) {
              console.error('Failed to save assistant message:', saveErr);
              void logEvent({
                severity: 'ERROR',
                source: 'llm',
                message: saveErr instanceof Error ? saveErr.message : 'Failed to save assistant message',
                route: '/api/chat/stream',
                sessionId,
                userId: viewer.user.id,
                stack: saveErr instanceof Error ? saveErr.stack : '',
              });
            }
            controller.close();
            return;
          }
          const text = decoder.decode(value, { stream: true });
          fullResponse += text;
          controller.enqueue(value);
        } catch (err) {
          console.error('Stream error:', err);
          void logEvent({
            severity: 'ERROR',
            source: 'llm',
            message: err instanceof Error ? err.message : 'LLM stream failed',
            route: '/api/chat/stream',
            sessionId,
            userId: viewer.user.id,
            stack: err instanceof Error ? err.stack : '',
          });
          releaseSlot();
          controller.error(err);
        }
      },
      cancel(reason) {
        releaseSlot();
        return reader.cancel(reason).catch(() => {});
      },
    });

    return new Response(responseStream, {
      headers: {
        'X-Provider': provider,
        'X-Model': useModel,
        'X-Model-Downgraded': modelDowngraded ? '1' : '0',
        'X-Payload-Mode': policy.mode,
        'X-Payload-Input-Tokens': String(inputTokens),
        'X-Payload-System-Tokens': String(estimateTokens(systemPrompt)),
        'X-Payload-History-Messages': String(contextMessages.filter((m) => m.role !== 'system').length),
        'X-Payload-Max-Output': String(policy.maxOutputTokens),
        'X-Payload-Context-Cap': String(policy.contextCap),
        'X-Payload-Purged': String(payload.purged),
        'X-Queue-Lane': lane,
        'X-Queue-Wait-Ms': String(slot.waitedMs),
        'X-User-Message-Id': savedUserMessage.id,
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: any) {
    console.error('Chat stream error:', err);
    void logEvent({
      severity: 'ERROR',
      source: 'llm',
      message: err?.message ?? 'Stream failed',
      route: '/api/chat/stream',
      sessionId,
      userId: viewer.user.id,
      stack: err?.stack,
    });
    if (charged) await refundCredit(viewer).catch(() => {});
    return new Response(JSON.stringify({ error: err?.message ?? 'Stream failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/** Folds messages that left the raw High-Output window into ChatSession.memorySummary (batched, best-effort). */
async function updateRollingSummary(
  sessionId: string,
  messages: Array<{ role: string; content: string }>,
  previous: string,
  upTo: number,
  windowSize: number,
  target: { provider: string; model: string; config: any },
  charName: string,
  userName: string,
) {
  try {
    const olderCount = messages.length - windowSize;
    if (olderCount - upTo < SUMMARY_BATCH) return;
    const batch = messages.slice(upTo, olderCount);
    let summary = '';
    try {
      const reader = createLLMStream({
        messages: summaryPrompt(previous, batch, charName, userName),
        model: target.model,
        provider: target.provider,
        config: target.config,
        settings: { temperature: 0.3, topP: 0.9, maxTokens: SUMMARY_TOKEN_LIMIT },
      }).getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        summary += decoder.decode(value, { stream: true });
      }
    } catch (err) {
      console.error('[memory] summary call failed:', err);
    }
    summary = summary.trim();
    if (!summary || summary.startsWith('[Error')) summary = extractiveSummary(previous, batch);
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { memorySummary: truncateTokens(summary, SUMMARY_TOKEN_LIMIT), memorySummaryUpTo: olderCount },
    });
  } catch (err) {
    console.error('[memory] rolling summary update failed:', err);
  }
}
