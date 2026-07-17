// app/api/dnd/characters/[id]/homebrew-class/route.ts — AI-assist for the homebrew class builder
// (Slice 5). POST { prompt }: the model fills the CUSTOM_CLASS_TOOL with a class DRAFT, which flows
// through the EXISTING engine (parseCustomClassDraft → buildCustomClass → reviewCustomClass). Returns
// the draft + the built ClassDefinition + a split review (errors block a save, warnings advise) for the
// player to review + edit. Does NOT persist — it proposes; a later action commits the edited class.
// Owner/DM only (the write chokepoint), and scoped to the character's own system.
import { NextRequest, NextResponse } from 'next/server';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { dndToolCall, dndAiConfigured } from '@/lib/dnd/ai';
import { parseCustomClassDraft, CUSTOM_CLASS_TOOL, splitReview } from '@/lib/dnd/classes/custom-ai';
import { buildCustomClass, reviewCustomClass } from '@/lib/dnd/classes/custom';
import { normalizeSystem } from '@/lib/dnd/systems';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!dndAiConfigured()) return NextResponse.json({ error: 'AI is not configured on this server.' }, { status: 503 });

  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { character } = access.access;
  const system = normalizeSystem((character as { system?: string }).system);

  const body = await req.json().catch(() => ({}));
  const prompt = String(body?.prompt ?? '').trim();
  if (!prompt) return NextResponse.json({ error: 'Describe the class you want the AI to draft.' }, { status: 400 });

  let call;
  try {
    call = await dndToolCall<Record<string, unknown>>({
      system: `You design homebrew classes for the ${system} tabletop system. Fill the homebrew_class tool with a complete, balanced DRAFT. Use 5e-style ability keys. Do NOT add Ability Score Improvement or subclass-choice features — the engine inserts those.`,
      user: `Draft this class: ${prompt}`,
      tools: [CUSTOM_CLASS_TOOL],
      toolChoice: { type: 'tool', name: CUSTOM_CLASS_TOOL.name },
      maxTokens: 3000,
    });
  } catch {
    return NextResponse.json({ error: 'The AI draft failed — please try again.' }, { status: 502 });
  }
  if (!call) return NextResponse.json({ error: 'The AI did not return a class draft.' }, { status: 502 });

  const draft = parseCustomClassDraft(call.input, system);
  const definition = buildCustomClass(draft);
  const review = splitReview(reviewCustomClass(definition));

  return NextResponse.json({ ok: true, draft, definition, review });
}
