// app/api/dnd/characters/[id]/ig-build/ai/route.ts — AI-customize an Intuitive Games character (full-sheet
// Slice 10). Owner/player/DM only (the write chokepoint). Grounds the model to the IG rules + vanilla
// catalog, has it fill the structured build tool, normalizes the result to safe IGPicks, assembles the full
// IGCharacter, and persists it. Invented (non-catalog) content is auto-flagged CUSTOM by the same provenance
// classifier the manual builder uses — so the AI can spice things up without ever passing homebrew as vanilla.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { dndToolCall, dndAiConfigured } from '@/lib/dnd/ai';
import { assembleIGVanillaCharacter } from '@/lib/dnd/systems/intuitive-games/builder';
import { parseIGPicks, IG_PICKS_TOOL, igBuilderSystemPrompt } from '@/lib/dnd/systems/intuitive-games/ai';
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
      system: igBuilderSystemPrompt(),
      user: `Build this Intuitive Games character: ${prompt}\nName it "${character.name}" unless the description gives a name.`,
      tools: [IG_PICKS_TOOL],
      toolChoice: { type: 'tool', name: IG_PICKS_TOOL.name },
      maxTokens: 2048,
    });
  } catch {
    return NextResponse.json({ error: 'The AI build failed — please try again.' }, { status: 502 });
  }
  if (!call) return NextResponse.json({ error: 'The AI did not return a build.' }, { status: 502 });

  const picks = parseIGPicks(call.input);
  if (!picks.name) picks.name = character.name;
  const assembled = assembleIGVanillaCharacter(picks);
  const dmGranted = (Array.isArray(character.dm_granted) ? character.dm_granted : []) as { kind?: ElementKind; name: string; grantedBy?: string | null; mechanics?: string | null }[];
  const summary = summarizeCharacterProvenance(assembled, 'intuitive-games', dmGranted);

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
