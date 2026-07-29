// app/api/dnd/homebrew/[id]/transpose/route.ts — translate a piece into another system (P6-18).
//
//   POST { system, notes?, variantId? } → generate, or RE-generate an existing draft with the author's notes
//
// The review loop the owner described — approve / deny / try again with notes — is served by three ordinary
// operations rather than three new endpoints: **approve** is the existing PATCH (set visibility), **deny**
// is the existing DELETE, and **retry** is this route again with `variantId`. Inventing a parallel
// lifecycle for transposed pieces would mean two sets of rules about who may edit what.
//
// `variantId` is what stops a fussy author accumulating nine rejected drafts: a retry REWRITES the same
// draft. It is verified to belong to this caller and to descend from this source before anything is
// overwritten — otherwise "retry" becomes an arbitrary-row write primitive.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { dndCompleteJSON, dndAiConfigured } from '@/lib/dnd/ai';
import { checkRateLimit, rateLimitSubject, rateLimitHeaders } from '@/lib/dnd/rate-limit';
import { rowToHomebrew, canReadHomebrew, homebrewToRow, type HomebrewRow } from '@/lib/dnd/homebrew/store';
import { normalizeContentSystem } from '@/lib/dnd/homebrew/kinds';
import { isSystemAvailable } from '@/lib/dnd/systems';
import {
  TRANSPOSE_SYSTEM_PROMPT, transposeUserPrompt, normalizeTransposed, transposeCredit,
  type TransposedDraft,
} from '@/lib/dnd/homebrew/transpose';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!dndAiConfigured()) {
    return NextResponse.json({ error: 'AI translation is not configured on this deployment.' }, { status: 503 });
  }

  let body: { system?: string; notes?: string; variantId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }

  // ── the source ───────────────────────────────────────────────────────────────────────────────
  const { data: srcRow } = await supabaseAdmin.from('dnd_homebrew').select('*').eq('id', params.id).maybeSingle();
  const row = srcRow as HomebrewRow | null;
  if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const { data: u } = await supabaseAdmin.from('dnd_users').select('display_name').eq('id', row.owner_user_id).maybeSingle();
  const source = rowToHomebrew(row, (u as { display_name?: string } | null)?.display_name ?? '');
  if (!source || !canReadHomebrew(source, { userId: session.userId })) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  // Note this is READ access, not write: translating someone else's PUBLIC content into your system is a
  // reasonable thing to want, and the result belongs to YOU (owner_user_id below), with the original
  // credited. What you may not do is modify their piece — and nothing here does.

  const target = normalizeContentSystem(source.kind, body.system);
  if (target === source.system) {
    return NextResponse.json({ error: 'That is the system it is already written for.' }, { status: 400 });
  }
  if (target !== 'any' && !isSystemAvailable(target)) {
    return NextResponse.json({ error: 'That system is not playable yet.' }, { status: 400 });
  }

  const limit = await checkRateLimit('ai', rateLimitSubject({ userId: session.userId }));
  if (!limit.allowed) {
    return NextResponse.json({ error: limit.message }, { status: 429, headers: rateLimitHeaders(limit, 'ai') });
  }

  // ── the draft being retried, if any ──────────────────────────────────────────────────────────
  let previous: TransposedDraft | null = null;
  let variantId: string | null = null;
  if (body.variantId) {
    const { data: vRow } = await supabaseAdmin.from('dnd_homebrew').select('*').eq('id', body.variantId).maybeSingle();
    const v = vRow as HomebrewRow | null;
    // Three checks, because without them `variantId` is a write primitive pointed at any row: it must be
    // YOURS, and it must actually descend from THIS source.
    if (!v || v.owner_user_id !== session.userId || v.origin_id !== params.id) {
      return NextResponse.json({ error: 'That draft is not a translation of this piece.' }, { status: 400 });
    }
    variantId = v.id;
    previous = { name: v.name, summary: v.summary ?? '', description: v.description ?? '' };
  }

  // ── generate ─────────────────────────────────────────────────────────────────────────────────
  let draft: TransposedDraft | null;
  try {
    draft = normalizeTransposed(await dndCompleteJSON<unknown>({
      system: TRANSPOSE_SYSTEM_PROMPT,
      user: transposeUserPrompt(source, target, { notes: body.notes, previous }),
      maxTokens: 1600,
      // Higher than the design review's 0.3: a retry that returns nearly the same text is useless to an
      // author who just asked for something different.
      temperature: 0.7,
    }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'The translation failed.' }, { status: 502 });
  }
  if (!draft) return NextResponse.json({ error: 'The translation came back unusable. Try again.' }, { status: 502 });

  // The provenance line lives in the DESCRIPTION, not only in the UI: the description is what travels into
  // the library, an export and the AI grounding. A note that exists in one component is not provenance.
  const description = `${draft.description}\n\n${transposeCredit(source, source.system)}`;

  const shared = homebrewToRow({
    kind: source.kind,
    system: target,
    name: draft.name,
    summary: draft.summary,
    description,
    tags: [...(source.tags ?? []), 'translated'],
    // Private draft, always. A machine translation must not be able to reach a library or a sheet before a
    // human has looked at it — the worst outcome here is a bad translation nobody knows is a translation.
    visibility: 'private',
  });

  if (variantId) {
    const { data, error } = await supabaseAdmin
      .from('dnd_homebrew')
      .update({ ...shared, updated_at: new Date().toISOString() })
      .eq('id', variantId).select('*').single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not save the retry.' }, { status: 500 });
    return NextResponse.json({ content: rowToHomebrew(data as HomebrewRow, session.displayName), rationale: draft.rationale });
  }

  const { data, error } = await supabaseAdmin
    .from('dnd_homebrew')
    .insert({
      ...shared,
      owner_user_id: session.userId, // the translation is YOURS; the original is credited in the text
      origin_id: params.id,
      status: 'draft',
    })
    .select('*').single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not save the translation.' }, { status: 500 });

  return NextResponse.json({ content: rowToHomebrew(data as HomebrewRow, session.displayName), rationale: draft.rationale }, { status: 201 });
}
