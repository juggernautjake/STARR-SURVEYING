// app/api/dnd/homebrew/draft/route.ts — draft a whole piece from a name and a sentence (P6-15b).
//
// The counterpart to `/assist` (one field) and `/ingest` (a document). Stateless like both, and for the
// same reason: this is most useful *before* the piece exists, so there is no id to load.
//
// IT RETURNS ROWS, NOT VALUES. `/ingest` returns field values the builder merges into empty slots; this
// returns a reviewable row per field, each carrying the author's current text beside the suggestion and a
// flag saying whether accepting it would OVERWRITE. That difference is the whole point of the P6-15b split
// — a multi-field proposal that arrives as a values blob grows an "apply" button, and the per-field review
// becomes decoration.
import { NextRequest, NextResponse } from 'next/server';
import { getDndSession } from '@/lib/dnd/auth';
import { dndCompleteJSON, dndAiConfigured } from '@/lib/dnd/ai';
import { enforceAiLimits } from '@/lib/dnd/rate-limit';
import { isHomebrewKind } from '@/lib/dnd/homebrew/model';
import { normalizeContentSystem } from '@/lib/dnd/homebrew/kinds';
import {
  DRAFT_SYSTEM_PROMPT, draftUserPrompt, draftProposalRows, describeDraftProposal,
} from '@/lib/dnd/homebrew/draft-assist';

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!dndAiConfigured()) {
    return NextResponse.json({ error: 'AI drafting is not configured on this deployment.' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as {
    kind?: unknown; system?: unknown; name?: unknown; idea?: unknown; values?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });

  const kind = String(body.kind ?? '');
  if (!isHomebrewKind(kind)) return NextResponse.json({ error: 'Unknown content kind.' }, { status: 400 });
  const system = normalizeContentSystem(kind, body.system);

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const idea = typeof body.idea === 'string' ? body.idea.trim() : '';
  if (!name && !idea) {
    return NextResponse.json({ error: 'Give it a name, or a sentence about it — ideally both.' }, { status: 400 });
  }
  // Bounded because it is interpolated straight into a prompt. A megabyte of "idea" is either a mistake or
  // an attempt to smuggle instructions past the system prompt, and neither deserves a model call.
  if (idea.length > 2000) return NextResponse.json({ error: 'Keep the description under 2000 characters.' }, { status: 400 });

  const current = body.values && typeof body.values === 'object' && !Array.isArray(body.values)
    ? (body.values as Record<string, unknown>)
    : {};

  const aiLimited = await enforceAiLimits(session.userId);
  if (aiLimited) return aiLimited;

  try {
    const raw = await dndCompleteJSON<unknown>({
      system: DRAFT_SYSTEM_PROMPT,
      user: [{ role: 'user', content: draftUserPrompt({ kind, system, name, idea }) }],
      maxTokens: 4000,
      // Above ingest's 0.1 and matching P6-15's assist: this is authorship, not transcription, and a
      // first draft at near-zero temperature reads like a form letter.
      temperature: 0.8,
    });

    const rows = draftProposalRows(kind, current, raw);
    return NextResponse.json({ rows, summary: describeDraftProposal(rows) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not draft that.' }, { status: 500 });
  }
}
