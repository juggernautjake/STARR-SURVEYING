// app/api/admin/work-mode/assistant/route.ts — the in-Work-Mode AI assistant (Area D8, TEXT half; voice I/O is
// device-gated and layered on the client later). A field crew member types a question ("what's the back-azimuth
// of N30°E?", "how do I set up a closed traverse?", "IRS mileage rate?") and Claude answers concisely, scoped
// to surveying field work. Reuses the same Anthropic pattern as the learn tutor / CAD chat routes.
import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const MODEL = process.env.CAD_AI_MODEL ?? 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 900;

interface ChatMessage { role: 'user' | 'assistant'; content: string }

const SYSTEM = [
  'You are a concise, practical FIELD ASSISTANT for a land-surveying crew using a mobile Work Mode app.',
  'Help with: bearings ↔ azimuths and back-bearings, angle arithmetic (add/subtract, deflection, interior),',
  'traverse setup + closure, latitude/departure, the law of sines/cosines and right-triangle trig, GPS/total-',
  'station field procedures, equipment checks, IRS mileage, and general job logistics.',
  'Answer in a few sentences or a short list — the surveyor is in the field on a phone. Show the formula and the',
  'numeric result when a calculation is asked. If a question is clearly outside surveying/field work, say so',
  'briefly and steer back. Never invent a measurement you were not given.',
].join(' ');

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'The AI assistant is not configured.' }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const messages = Array.isArray(body?.messages) ? (body.messages as ChatMessage[]) : [];
  const clean = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12) // keep the last few turns; a field chat doesn't need deep history
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 4000) }));
  if (clean.length === 0 || clean[clean.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Ask a question.' }, { status: 400 });
  }

  // Optional active-job context so answers can reference the job the crew is on.
  const job = typeof body?.jobContext === 'string' ? body.jobContext.trim().slice(0, 500) : '';
  const system = job ? `${SYSTEM}\n\nActive job context: ${job}` : SYSTEM;

  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: clean as Anthropic.MessageParam[],
  });
  const reply = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  return NextResponse.json({ reply: reply || 'Sorry — I couldn’t answer that. Try rephrasing.' });
}, { routeName: 'admin/work-mode.assistant' });
