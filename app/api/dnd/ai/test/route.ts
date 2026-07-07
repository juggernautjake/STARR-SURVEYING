// app/api/dnd/ai/test/route.ts — smoke endpoint for the AI scaffolding (Phase I1).
// Any signed-in /dnd user can ping it to confirm the model responds. Kept tiny
// (low max_tokens) so it's a cheap health check, not a feature surface.
import { NextResponse } from 'next/server';
import { getDndSession } from '@/lib/dnd/auth';
import { dndComplete, dndAiConfigured, DND_AI_MODEL } from '@/lib/dnd/ai';

export async function GET() {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!dndAiConfigured()) return NextResponse.json({ ok: false, error: 'AI is not configured (missing ANTHROPIC_API_KEY).' }, { status: 503 });

  try {
    const text = await dndComplete({
      system: 'You are a terse test probe. Reply with exactly one word.',
      user: 'Reply with the single word: pong',
      maxTokens: 16,
      temperature: 0,
    });
    return NextResponse.json({ ok: true, model: DND_AI_MODEL, reply: text });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'AI call failed.' }, { status: 502 });
  }
}
