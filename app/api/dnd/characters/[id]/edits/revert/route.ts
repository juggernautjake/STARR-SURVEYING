// app/api/dnd/characters/[id]/edits/revert/route.ts — the DM's "Revert" from the review queue
// (Slice 26). POST { editId }: loads that audit row, reverses it against the current sheet via the
// pure `revertSheetEdit` (restoring the recorded `old_value`), persists, and audits the revert
// itself. Gated on write access (DM or owner) — the same gate every sheet write uses.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { getCharacterAccess } from '@/lib/dnd/characters';
import { revertSheetEdit, type SheetEdit } from '@/lib/dnd/sheet-edits';
import type { Character } from '@/app/dnd/_sheet/types';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const res = await getCharacterAccess(params.id);
  if (!res.access) return NextResponse.json({ error: res.error }, { status: res.status });
  if (!res.access.canWrite) {
    return NextResponse.json({ error: 'You cannot edit this character.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const editId = String((body as { editId?: unknown }).editId ?? '').trim();
  if (!editId) return NextResponse.json({ error: 'editId is required.' }, { status: 400 });

  // The audit row to reverse — scoped to THIS character so a caller can't revert another sheet's edit.
  const { data: edit, error: eErr } = await supabaseAdmin
    .from('dnd_sheet_edits')
    .select('id, field_path, old_value, new_value')
    .eq('id', editId)
    .eq('character_id', params.id)
    .single();
  if (eErr || !edit) return NextResponse.json({ error: 'That edit was not found on this character.' }, { status: 404 });
  if (!edit.new_value) return NextResponse.json({ error: 'This edit carries no reversible change.' }, { status: 400 });

  const { data: charRow, error: cErr } = await supabaseAdmin
    .from('dnd_characters')
    .select('data, name')
    .eq('id', params.id)
    .single();
  if (cErr || !charRow?.data) return NextResponse.json({ error: 'Could not load the character.' }, { status: 500 });

  const reverted = revertSheetEdit(charRow.data as Character, edit.new_value as SheetEdit, edit.old_value);
  const { error: upErr } = await supabaseAdmin
    .from('dnd_characters')
    .update({ data: reverted, name: reverted.meta?.name || charRow.name })
    .eq('id', params.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Audit the revert itself, so undoing an edit is as visible as making one.
  await supabaseAdmin.from('dnd_sheet_edits').insert({
    character_id: params.id,
    editor_user_id: session.userId,
    is_dm: res.access.isDM,
    field_path: `revert:${edit.field_path ?? ''}`,
    old_value: edit.new_value as unknown,
    new_value: null,
    scope: 'permanent',
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true });
}
