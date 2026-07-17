// app/api/dnd/characters/[id]/edits/restore/route.ts — restore a character to an earlier point in its
// history (history/undo D1). POST { batchId }: undo every un-reverted AI change made AFTER the chosen
// batch, rolling the sheet back to how it was right after that batch — "take me back to before level 20".
// Built on the replayable audit trail (no snapshot storage): fold `revertBatch` over the intervening
// edits. Write-gated like the other revert routes.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { getCharacterAccess } from '@/lib/dnd/characters';
import { revertBatch, type AuditedEdit, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { restorePlan, type EditHistoryRow } from '@/lib/dnd/edit-history';
import type { Character } from '@/app/dnd/_sheet/types';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const res = await getCharacterAccess(params.id);
  if (!res.access) return NextResponse.json({ error: res.error }, { status: res.status });
  if (!res.access.canWrite) return NextResponse.json({ error: 'You cannot edit this character.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const batchId = String((body as { batchId?: unknown }).batchId ?? '').trim();
  if (!batchId) return NextResponse.json({ error: 'batchId is required.' }, { status: 400 });

  // Compute which batches to undo from the lightweight history rows.
  const { data: histRows, error: hErr } = await supabaseAdmin
    .from('dnd_sheet_edits')
    .select('batch_id, source, field_path, summary, created_at')
    .eq('character_id', params.id)
    .order('created_at', { ascending: true });
  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 });
  const { batchIds } = restorePlan((histRows ?? []) as EditHistoryRow[], batchId);
  if (!batchIds.length) {
    return NextResponse.json({ ok: true, restored: 0, summary: 'That is already the character’s current state — nothing to roll back.' });
  }

  // Fetch the full edits for those batches (in application order) and revert them as one.
  const { data: full, error: fErr } = await supabaseAdmin
    .from('dnd_sheet_edits')
    .select('old_value, new_value, created_at')
    .eq('character_id', params.id)
    .in('batch_id', batchIds)
    .order('created_at', { ascending: true });
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
  const audited = ((full ?? []) as { old_value: unknown; new_value: SheetEdit | null }[])
    .filter((r): r is { old_value: unknown; new_value: SheetEdit } => !!r.new_value)
    .map((r): AuditedEdit => ({ edit: r.new_value, oldValue: r.old_value }));
  if (!audited.length) return NextResponse.json({ ok: true, restored: 0, summary: 'Nothing reversible to roll back.' });

  const { data: charRow, error: cErr } = await supabaseAdmin
    .from('dnd_characters').select('data, name').eq('id', params.id).single();
  if (cErr || !charRow?.data) return NextResponse.json({ error: 'Could not load the character.' }, { status: 500 });

  const reverted = revertBatch(charRow.data as Character, audited);
  const { error: upErr } = await supabaseAdmin
    .from('dnd_characters').update({ data: reverted, name: reverted.meta?.name || charRow.name }).eq('id', params.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Audit each undone batch as reverted, so the history stays consistent (these batches now show undone).
  await supabaseAdmin.from('dnd_sheet_edits').insert(
    batchIds.map((bid) => ({
      character_id: params.id, editor_user_id: session.userId, is_dm: res.access!.isDM,
      field_path: `revert-batch:${bid}`, old_value: null, new_value: null, scope: 'permanent',
      source: 'revert', summary: `Rolled back as part of restoring to an earlier version`,
    })),
  ).then(() => {}, () => {});

  return NextResponse.json({ ok: true, restored: batchIds.length, editCount: audited.length });
}
