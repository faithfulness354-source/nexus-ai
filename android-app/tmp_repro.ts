import { prisma } from './lib/db';
import { resolveChatTarget } from './lib/llm/resolve';
import { payloadPolicy, compressSystemPrompt, assembleTierPayload, minify } from './lib/payload-router';
import { sceneTagsForLLM } from './lib/scene-tags';
import { estimateTokens, countSystemTokens, countHistoryTokens } from './lib/tokens';

(async () => {
  const session = await prisma.chatSession.findUnique({ where: { id: 'cmuxj8a170003ns08ekp6s48i' }, include: { character: true, messages: { orderBy: { index: 'asc' } }, user: true } as any }) as any;
  const c = session.character;
  console.log('owner role', session.user?.role, 'tier', session.user?.tier, 'msgs', session.messages.length);
  console.log('UI counter: system', countSystemTokens(c), 'history', countHistoryTokens(session.messages));
  const policy = payloadPolicy('FREE', false, null);
  const sys = compressSystemPrompt({ name: c.name, title: c.title, personality: c.personality, systemPrompt: c.systemPrompt, summary: c.summary, scenario: c.scenario, customRules: c.customRules });
  const hist = session.messages.slice(0, -2).map((m: any) => ({ role: m.role.toLowerCase(), content: sceneTagsForLLM(m.content) }));
  const lastUser = session.messages[session.messages.length - 2];
  const payload = assembleTierPayload(minify(sys), [...hist, { role: 'user', content: lastUser.content }], policy);
  console.log('server payload input tokens', payload.inputTokens, 'purged', payload.purged, 'cap', policy.contextCap);
  const target = await resolveChatTarget(session.provider, session.model);
  const key = (target?.config as any)?.apiKey;
  const systemMsg = payload.messages.find((m: any) => m.role === 'system');
  const contents = payload.messages.filter((m: any) => m.role !== 'system').map((m: any) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  for (const thinking of [0, null]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${target!.model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: systemMsg!.content }] }, contents, generationConfig: { temperature: 0.8, topP: 0.95, maxOutputTokens: 350, ...(thinking === 0 ? { thinkingConfig: { thinkingBudget: 0 } } : {}) } }),
    });
    const j: any = await r.json();
    const text = (j?.candidates?.[0]?.content?.parts ?? []).filter((p: any) => !p.thought).map((p: any) => p.text ?? '').join('');
    console.log(`thinking=${thinking}`, r.status, 'finish', j?.candidates?.[0]?.finishReason, 'usage', JSON.stringify(j?.usageMetadata), 'chars', text.length, 'est', estimateTokens(text), 'tail:', JSON.stringify(text.slice(-80)));
  }
  await prisma.$disconnect();
})();
