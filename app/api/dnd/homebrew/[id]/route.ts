// app/api/dnd/homebrew/[id]/route.ts — read, edit and delete one piece of custom content (P6-4).
//
// Reads are visibility-gated (`canReadHomebrew`: the creator always, plus anyone for public/unlisted);
// writes are creator-only (`canWriteHomebrew`). A DM's authority is over what is LEGAL IN THEIR CAMPAIGN
// (`policy.ts`), never over someone else's authored work — so there is deliberately no DM branch here.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { validateHomebrewPayload } from '@/lib/dnd/homebrew/adopt';
import { isHomebrewKind } from '@/lib/dnd/homebrew/model';
import { normalizeContentSystem, validateDraftFields, isPartialBuild, draftLevelReach , draftPayloadFrom } from '@/lib/dnd/homebrew/kinds';
import {
  rowToHomebrew, homebrewToRow, pickCreatorWritable, canReadHomebrew, canWriteHomebrew,
  statusForVisibility, type HomebrewRow, type StoredHomebrew,
} from '@/lib/dnd/homebrew/store';

/** Load the row and resolve its author, or null. Kept in one place so GET/PATCH/DELETE cannot disagree
 *  about what "the piece" is. */
async function loadPiece(id: string): Promise<StoredHomebrew | null> {
  const { data } = await supabaseAdmin.from('dnd_homebrew').select('*').eq('id', id).maybeSingle();
  const row = data as HomebrewRow | null;
  if (!row) return null;
  const { data: u } = await supabaseAdmin.from('dnd_users').select('display_name').eq('id', row.owner_user_id).maybeSingle();
  return rowToHomebrew(row, (u as { display_name?: string } | null)?.display_name ?? '');
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  const piece = await loadPiece(params.id);
  if (!piece) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!canReadHomebrew(piece, { userId: session?.userId ?? null })) {
    // 404, not 403: a private piece should not confirm its own existence to a stranger guessing ids.
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  return NextResponse.json({ content: piece, canWrite: canWriteHomebrew(piece, { userId: session?.userId ?? null }) });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const piece = await loadPiece(params.id);
  if (!piece) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!canWriteHomebrew(piece, { userId: session.userId })) {
    return NextResponse.json({ error: 'This is not yours to edit.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }

  const patch = pickCreatorWritable(body);
  // The kind and system can change while a piece is being worked on (an author realises their "item" is
  // really an "effect"), so re-derive both rather than trusting the stored ones for validation.
  const kind = isHomebrewKind(patch.kind) ? patch.kind : piece.kind;
  const system = patch.system !== undefined ? normalizeContentSystem(kind, patch.system) : piece.system;
  const merged = { ...(piece.payload as Record<string, unknown> ?? {}), ...body };
  // THE SAME DEFECT AS THE POST PATH, and it hid the same way: `merged` above is assembled for VALIDATION
  // from the body's top-level fields, but only `patch.payload` was ever persisted — so an edit validated
  // the author's changes and then saved the payload untouched. Merged over the existing payload rather
  // than replacing it, so a PATCH that carries one field does not wipe the rest.
  const nextPayload = draftPayloadFrom(kind, body);
  if (nextPayload) patch.payload = { ...(piece.payload as Record<string, unknown> ?? {}), ...nextPayload };

  const problems = [
    ...validateDraftFields(kind, merged),
    ...validateHomebrewPayload({
      ...piece, kind, system,
      payload: patch.payload !== undefined ? patch.payload : piece.payload,
    }),
  ];
  if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });

  const row = homebrewToRow({ ...patch, kind, system });
  // Visibility is the publish action, so status follows it — through the one helper, never inline.
  if (patch.visibility !== undefined) row.status = statusForVisibility(patch.visibility, piece.status);
  if (patch.payload !== undefined || patch.kind !== undefined) {
    row.partial_to_level = isPartialBuild(kind, merged) ? draftLevelReach(kind, merged) : null;
  }
  row.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin.from('dnd_homebrew').update(row).eq('id', params.id).select('*').single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not save that.' }, { status: 500 });
  return NextResponse.json({ content: rowToHomebrew(data as HomebrewRow, session.displayName) });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const piece = await loadPiece(params.id);
  if (!piece) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!canWriteHomebrew(piece, { userId: session.userId })) {
    return NextResponse.json({ error: 'This is not yours to delete.' }, { status: 403 });
  }

  // Characters that ADOPTED this piece are untouched on purpose: adoption copies the payload onto the
  // sheet (`adoptHomebrew`), so deleting the catalog entry must not reach into someone else's character
  // and remove a class they are playing. Transposed variants keep working too — `origin_id` is
  // ON DELETE SET NULL, so they lose their lineage rather than being destroyed with the original.
  const { error } = await supabaseAdmin.from('dnd_homebrew').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
