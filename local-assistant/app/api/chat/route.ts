import { NextRequest } from 'next/server';
import { fetchLocal, trimSlash } from '@/lib/local-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ChatBody = {
  prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  model?: string;
  backend?: 'ollama' | 'openai-compat';
  ollamaBaseUrl?: string;
  openaiCompatBaseUrl?: string;
  stream?: boolean;
};

/**
 * Proxies chat to a local Ollama or OpenAI-compatible server.
 * Returns the model text as-is — no truncation, filtering, or rewrite.
 */
export async function POST(request: NextRequest) {
  let body: ChatBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const model = (body.model ?? '').trim();
  if (!model) return Response.json({ error: 'model is required' }, { status: 400 });
  if (!prompt && messages.length === 0) {
    return Response.json({ error: 'prompt or messages is required' }, { status: 400 });
  }

  const backend = body.backend === 'openai-compat' ? 'openai-compat' : 'ollama';
  const wantStream = body.stream !== false;

  try {
    if (backend === 'openai-compat') {
      return await openAiCompat(body, model, prompt, messages, wantStream);
    }
    return await ollamaGenerate(body, model, prompt, messages, wantStream);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Chat request failed';
    return Response.json({ error: message }, { status: 502 });
  }
}

function flattenPrompt(prompt: string, messages: Array<{ role: string; content: string }>): string {
  if (prompt.trim()) return prompt;
  return messages
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n\n');
}

async function ollamaGenerate(
  body: ChatBody,
  model: string,
  prompt: string,
  messages: Array<{ role: string; content: string }>,
  wantStream: boolean,
) {
  const base = trimSlash(body.ollamaBaseUrl || 'http://localhost:11434');
  const payload = {
    model,
    prompt: flattenPrompt(prompt, messages),
    stream: wantStream,
  };
  const res = await fetchLocal(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama ${res.status}: ${text || res.statusText}`);
  }

  if (!wantStream) {
    const data = await res.json();
    const content = typeof data?.response === 'string' ? data.response : JSON.stringify(data);
    return Response.json({ content });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = res.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const chunk = JSON.parse(trimmed) as { response?: string };
              if (typeof chunk.response === 'string' && chunk.response.length) {
                controller.enqueue(encoder.encode(chunk.response));
              }
            } catch {
              // Pass through non-JSON fragments unchanged.
              controller.enqueue(encoder.encode(trimmed));
            }
          }
        }
        if (buffer.trim()) {
          try {
            const chunk = JSON.parse(buffer.trim()) as { response?: string };
            if (typeof chunk.response === 'string') controller.enqueue(encoder.encode(chunk.response));
          } catch {
            controller.enqueue(encoder.encode(buffer));
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function openAiCompat(
  body: ChatBody,
  model: string,
  prompt: string,
  messages: Array<{ role: string; content: string }>,
  wantStream: boolean,
) {
  const base = trimSlash(body.openaiCompatBaseUrl || 'http://localhost:1234/v1');
  const chatMessages =
    messages.length > 0
      ? messages
      : [{ role: 'user', content: prompt }];

  const res = await fetchLocal(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: chatMessages,
      stream: wantStream,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI-compatible server ${res.status}: ${text || res.statusText}`);
  }

  if (!wantStream) {
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return Response.json({ content: typeof content === 'string' ? content : JSON.stringify(data) });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = res.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') continue;
            try {
              const json = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
              const piece = json.choices?.[0]?.delta?.content;
              if (typeof piece === 'string' && piece.length) controller.enqueue(encoder.encode(piece));
            } catch {
              /* keep raw stream resilient */
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
