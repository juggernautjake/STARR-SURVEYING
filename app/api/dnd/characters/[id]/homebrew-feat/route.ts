// app/api/dnd/characters/[id]/homebrew-feat/route.ts — AI-assist for the homebrew feat builder (Slice 5).
// POST { prompt }: the model fills CUSTOM_FEAT_TOOL with a feat DRAFT, which flows through the existing
// engine (parseCustomFeatInput → buildCustomFeat → reviewCustomFeat). Returns the built feat + a split
// review (errors block, warnings advise) for the player to review. Propose-only; owner/DM only.
import { NextRequest, NextResponse } from 'next/server';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { dndToolCall, dndAiConfigured } from '@/lib/dnd/ai';
import { parseCustomFeatInput, CUSTOM_FEAT_TOOL, splitReview } from '@/lib/dnd/classes/custom-ai';
import { buildCustomFeat, reviewCustomFeat } from '@/lib/dnd/classes/custom';
import { normalizeSystem } from '@/lib/dnd/systems';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!dndAiConfigured()) return NextResponse.json({ error: 'AI is not configured on this server.' }, { status: 503 });

  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const system = normalizeSystem((access.access.character as { system?: string }).system);

  const body = await req.json().catch(() => ({}));
  const prompt = String(body?.prompt ?? '').trim();
  if (!prompt) return NextResponse.json({ error: 'Describe the feat you want the AI to draft.' }, { status: 400 });

  let call;
  try {
    call = await dndToolCall<Record<string, unknown>>({
      system: `You design homebrew feats for the ${system} tabletop system. Fill the homebrew_feat tool with a balanced DRAFT. Pick a category, a prerequisite if warranted, at most one +1 ability increase, and clear rules text.`,
      user: `Draft this feat: ${prompt}`,
      tools: [CUSTOM_FEAT_TOOL],
      toolChoice: { type: 'tool', name: CUSTOM_FEAT_TOOL.name },
      maxTokens: 1500,
    });
  } catch {
    return NextResponse.json({ error: 'The AI draft failed — please try again.' }, { status: 502 });
  }
  if (!call) return NextResponse.json({ error: 'The AI did not return a feat draft.' }, { status: 502 });

  const input = parseCustomFeatInput(call.input, system);
  const feat = buildCustomFeat(input);
  const review = splitReview(reviewCustomFeat(feat));
  return NextResponse.json({ ok: true, feat, review });
}
