// app/api/dnd/characters/[id]/edits/revert-batch/route.ts — undo a whole AI request as a unit
// (history/undo B1). POST { batchId }: loads every audit row from that batch (from ONE ai-edit
// request), folds `revertBatch` over them in reverse order (restoring each recorded old_value),
// persists, and audits the batch revert. Gated on write access, like the single-edit revert.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { getCharacterAccess } from '@/lib/dnd/characters';
import { revertBatch, type AuditedEdit, type SheetEdit } from '@/lib/dnd/sheet-edits';
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
  const batchId = String((body as { batchId?: unknown }).batchId ?? '').trim();
  if (!batchId) return NextResponse.json({ error: 'batchId is required.' }, { status: 400 });

  // Every audited edit in the batch, oldest-first — scoped to THIS character so a caller can't revert
  // another sheet's batch. revertBatch itself walks them in reverse.
  const { data: rows, error: eErr } = await supabaseAdmin
    .from('dnd_sheet_edits')
    .select('id, field_path, old_value, new_value')
    .eq('character_id', params.id)
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true });
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });
  const audited = ((rows ?? []) as { field_path: string | null; old_value: unknown; new_value: SheetEdit | null }[])
    .filter((r): r is { field_path: string | null; old_value: unknown; new_value: SheetEdit } => !!r.new_value);
  if (!audited.length) return NextResponse.json({ error: 'That change was not found (it may already be undone).' }, { status: 404 });

  const { data: charRow, error: cErr } = await supabaseAdmin
    .from('dnd_characters')
    .select('data, name')
    .eq('id', params.id)
    .single();
  if (cErr || !charRow?.data) return NextResponse.json({ error: 'Could not load the character.' }, { status: 500 });

  const batch: AuditedEdit[] = audited.map((r) => ({ edit: r.new_value, oldValue: r.old_value }));
  const reverted = revertBatch(charRow.data as Character, batch);
  const { error: upErr } = await supabaseAdmin
    .from('dnd_characters')
    .update({ data: reverted, name: reverted.meta?.name || charRow.name })
    .eq('id', params.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Audit the batch revert itself (source 'revert'), so undoing a change is as visible as making one.
  await supabaseAdmin.from('dnd_sheet_edits').insert({
    character_id: params.id,
    editor_user_id: session.userId,
    is_dm: res.access.isDM,
    field_path: `revert-batch:${batchId}`,
    old_value: null,
    new_value: null,
    scope: 'permanent',
    source: 'revert',
    summary: `Undid a change of ${audited.length} edit(s)`,
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, reverted: audited.length });
}
