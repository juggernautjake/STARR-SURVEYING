// app/api/admin/research/testing/ai-chat/route.ts
// Streaming AI chat assistant for the Testing Lab — uses Server-Sent Events.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.RESEARCH_AI_MODEL || 'claude-sonnet-4-5-20250929';

const SYSTEM_PROMPT =
  "You are an AI assistant embedded in the STARR Research Testing Lab. You help developers debug the STARR AI property research pipeline — a Node.js worker that scrapes Texas county CAD portals, harvests deed/plat documents, and performs AI-powered land boundary analysis. The pipeline processes Bell County, TX properties. Help the developer understand code, debug failures, and suggest fixes.";

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  context?: string;
  runId?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !isDeveloper(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not configured. Set it in your environment to enable AI chat.' },
      { status: 501 },
    );
  }

  const body = (await req.json()) as ChatRequest;
  const { messages, context } = body;

  // Prepend context as a system note in the first user message if provided
  let anthropicMessages: Anthropic.MessageCreateParams['messages'] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  if (context && anthropicMessages.length > 0 && anthropicMessages[0].role === 'user') {
    anthropicMessages = [
      { role: 'user', content: `[Test Context]\n${context}\n\n${anthropicMessages[0].content}` },
      ...anthropicMessages.slice(1),
    ];
  }

  const anthropic = new Anthropic({ apiKey });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const messageStream = anthropic.messages.stream({
          model: MODEL,
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: anthropicMessages,
        });

        for await (const chunk of messageStream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            enqueue({ type: 'text', text: chunk.delta.text });
          }
        }

        enqueue({ type: 'done' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Streaming error';
        enqueue({ type: 'error', error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
