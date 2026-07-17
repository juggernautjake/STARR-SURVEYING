// app/api/dnd/characters/[id]/pf2-build/ai/route.ts — AI-build a Pathfinder 2e character. Owner/player/DM
// only. Grounds the model to the PF2 Remaster rules + vanilla catalog, has it fill the structured build
// tool, normalizes the result to safe PF2Picks, assembles the full character (projection + pf2e sidecar),
// and persists it. Invented (non-catalog) content is auto-flagged custom by the same provenance classifier.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { dndToolCall, dndAiConfigured } from '@/lib/dnd/ai';
import { assemblePF2VanillaCharacter } from '@/lib/dnd/systems/pathfinder2e/builder';
import { parsePF2Picks, PF2_PICKS_TOOL, pf2BuilderSystemPrompt } from '@/lib/dnd/systems/pathfinder2e/ai';
import { summarizeCharacterProvenance, type ElementKind } from '@/lib/dnd/provenance';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!dndAiConfigured()) return NextResponse.json({ error: 'AI is not configured on this server.' }, { status: 503 });

  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { character } = access.access;

  const body = await req.json().catch(() => ({}));
  const prompt = String(body?.prompt ?? '').trim();
  if (!prompt) return NextResponse.json({ error: 'Describe the character you want the AI to build.' }, { status: 400 });

  let call;
  try {
    call = await dndToolCall<Record<string, unknown>>({
      system: pf2BuilderSystemPrompt(),
      user: `Build this Pathfinder 2e character: ${prompt}\nName it "${character.name}" unless the description gives a name.`,
      tools: [PF2_PICKS_TOOL],
      toolChoice: { type: 'tool', name: PF2_PICKS_TOOL.name },
      maxTokens: 2048,
    });
  } catch {
    return NextResponse.json({ error: 'The AI build failed — please try again.' }, { status: 502 });
  }
  if (!call) return NextResponse.json({ error: 'The AI did not return a build.' }, { status: 502 });

  const picks = parsePF2Picks(call.input);
  if (!picks.name) picks.name = character.name;
  const assembled = assemblePF2VanillaCharacter(picks);
  const dmGranted = (Array.isArray(character.dm_granted) ? character.dm_granted : []) as { kind?: ElementKind; name: string; grantedBy?: string | null; mechanics?: string | null }[];
  const summary = summarizeCharacterProvenance(assembled, 'pathfinder2e', dmGranted);

  const { error } = await supabaseAdmin
    .from('dnd_characters')
    .update({ data: assembled, name: assembled.meta.name || character.name })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    summary: { vanilla: summary.vanilla.length, custom: summary.custom.length, dmGranted: summary.dmGranted.length, hasBlockingCustom: summary.hasBlockingCustom },
    elements: summary.elements,
  });
}
