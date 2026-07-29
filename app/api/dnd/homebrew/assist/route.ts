// app/api/dnd/homebrew/assist/route.ts — draft ONE field of a piece in progress (P6-15).
//
// Not under `[id]`, deliberately: assist is most useful while writing the first draft, before the piece
// exists and therefore before it has an id. So the route is stateless — it takes the draft-in-progress in
// the request body and returns text. It writes nothing, which is also what makes "never auto-applies" true
// at the API level rather than only in the component.
import { NextRequest, NextResponse } from 'next/server';
import { getDndSession } from '@/lib/dnd/auth';
import { dndComplete, dndAiConfigured } from '@/lib/dnd/ai';
import { enforceAiLimits } from '@/lib/dnd/rate-limit';
import { isHomebrewKind } from '@/lib/dnd/homebrew/model';
import { normalizeContentSystem } from '@/lib/dnd/homebrew/kinds';
import {
  ASSIST_SYSTEM_PROMPT, assistUserPrompt, cleanAssistText, isAssistableField,
} from '@/lib/dnd/homebrew/assist';

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!dndAiConfigured()) {
    return NextResponse.json({ error: 'AI help is not configured on this deployment.' }, { status: 503 });
  }

  let body: { kind?: string; system?: string; field?: string; values?: Record<string, unknown> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }

  const kind = body.kind;
  if (!isHomebrewKind(kind)) return NextResponse.json({ error: 'Unknown content kind.' }, { status: 400 });

  const field = String(body.field ?? '');
  // Checked against the REGISTRY, not against whatever the client sent. Otherwise `field` is an arbitrary
  // string interpolated into a prompt, and the "only prose fields" rule holds only as long as the UI
  // behaves.
  if (!isAssistableField(kind, field)) {
    return NextResponse.json({ error: 'That field cannot be drafted.' }, { status: 400 });
  }

  // Hourly AND daily (P2-2): the hourly window stops a burst, the daily one stops a slow grind that
  // never trips it. Checked hourly-first so the actionable message wins.
  const aiLimited = await enforceAiLimits(session.userId);
  if (aiLimited) return aiLimited;

  const system = normalizeContentSystem(kind, body.system);
  const values = (body.values && typeof body.values === 'object' ? body.values : {}) as Record<string, unknown>;

  try {
    const raw = await dndComplete({
      system: ASSIST_SYSTEM_PROMPT,
      user: assistUserPrompt(kind, system, field, values),
      maxTokens: 900,
      // Warmer than the review, cooler than the transposer: this is creative writing to a brief, and a
      // second press should give a genuinely different option rather than the same sentence reworded.
      temperature: 0.8,
    });
    const text = cleanAssistText(raw);
    if (!text) return NextResponse.json({ error: 'The suggestion came back empty. Try again.' }, { status: 502 });
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'The suggestion failed.' }, { status: 502 });
  }
}
