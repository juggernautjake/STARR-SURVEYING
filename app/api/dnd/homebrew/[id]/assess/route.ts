// app/api/dnd/homebrew/[id]/assess/route.ts — the AI's write-up on a piece (P6-17).
//
// The owner's ask: *"Once the user saves it, the AI will evaluate the build and write up an assessment."*
//
// A SEPARATE call, not part of the save. Three reasons, and the first is the one that matters: a model call
// on the save path makes saving slow and makes it fail when the model does — and the whole promise of this
// Studio is "save whenever, an unfinished piece is kept, not thrown away". Second, it lets an author
// re-assess after edits without re-saving. Third, it keeps the expensive thing behind its own rate-limit
// bucket rather than making every save cost AI budget.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { dndCompleteJSON, dndAiConfigured } from '@/lib/dnd/ai';
import { checkRateLimit, rateLimitSubject, rateLimitHeaders } from '@/lib/dnd/rate-limit';
import { rowToHomebrew, canWriteHomebrew, type HomebrewRow } from '@/lib/dnd/homebrew/store';
import {
  ASSESSMENT_SYSTEM_PROMPT, assessmentUserPrompt, normalizeAssessment,
} from '@/lib/dnd/homebrew/assess';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  if (!dndAiConfigured()) {
    return NextResponse.json({ error: 'AI review is not configured on this deployment.' }, { status: 503 });
  }

  const limit = await checkRateLimit('ai', rateLimitSubject({ userId: session.userId }));
  if (!limit.allowed) {
    return NextResponse.json({ error: limit.message }, { status: 429, headers: rateLimitHeaders(limit, 'ai') });
  }

  const { data } = await supabaseAdmin.from('dnd_homebrew').select('*').eq('id', params.id).maybeSingle();
  const row = data as HomebrewRow | null;
  if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const { data: u } = await supabaseAdmin.from('dnd_users').select('display_name').eq('id', row.owner_user_id).maybeSingle();
  const piece = rowToHomebrew(row, (u as { display_name?: string } | null)?.display_name ?? '');
  if (!piece) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  // Creator-only. An assessment is feedback on someone's work and is stored ON that work — letting a
  // stranger trigger one would let them write an opinion onto a piece they do not own.
  if (!canWriteHomebrew(piece, { userId: session.userId })) {
    return NextResponse.json({ error: 'This is not yours to review.' }, { status: 403 });
  }

  try {
    const raw = await dndCompleteJSON<unknown>({
      system: ASSESSMENT_SYSTEM_PROMPT,
      user: assessmentUserPrompt(piece, { partialToLevel: row.partial_to_level ?? null }),
      maxTokens: 900,
      // Low but not zero: a review should be consistent run to run, while still reading as prose.
      temperature: 0.3,
    });

    const assessment = normalizeAssessment(raw);
    // A half-parsed assessment is worse than none — it is shown to the author as a considered opinion.
    if (!assessment) {
      return NextResponse.json({ error: 'The review came back unusable. Try again.' }, { status: 502 });
    }
    const stamped = { ...assessment, assessedAt: new Date().toISOString() };

    // `updated_at` is deliberately NOT touched. An assessment is about the piece, not a change to it, and
    // bumping the timestamp would (a) reorder the author's library because a robot had an opinion, and
    // (b) instantly mark the assessment stale against the piece it just described.
    const { error } = await supabaseAdmin
      .from('dnd_homebrew')
      .update({ assessment: stamped })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ assessment: stamped });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'The review failed.' }, { status: 502 });
  }
}
