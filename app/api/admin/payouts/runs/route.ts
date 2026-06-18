// app/api/admin/payouts/runs/route.ts
//
// P11 of payment-infrastructure-2026-06-18.md — list + create
// payout batches.
//
//   GET   /api/admin/payouts/runs                     → { batches: [...] }
//   POST  /api/admin/payouts/runs  application/json   → { batch }
//
// POST body:
//   {
//     kind: 'weekly' | 'ad_hoc',
//     week_start?: 'YYYY-MM-DD',   // required when kind === 'weekly'
//     week_end?:   'YYYY-MM-DD',
//     items: [{ user_email, hours_cents, bonuses_cents, reimbursements_cents,
//               adjustments_cents, method, method_handle, user_name, notes }],
//     notes?: string,
//   }
//
// The batch lands in `draft` status. Approval (P12) is a separate
// POST. Dispatch (P13) requires the batch to be in `approved`.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  batchTotalCents,
  buildBatchLabel,
  normalizeBatchItem,
} from '@/lib/payouts/batch';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { data, error } = await supabaseAdmin
    .from('payout_batches')
    .select('id, label, kind, week_start, week_end, status, total_cents, created_by, approved_by, approved_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ batches: data ?? [] });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const kind = body.kind === 'ad_hoc' ? 'ad_hoc' : 'weekly';
  const weekStart = typeof body.week_start === 'string' ? body.week_start : null;
  const weekEnd = typeof body.week_end === 'string' ? body.week_end : null;
  if (kind === 'weekly' && (!weekStart || !weekEnd)) {
    return NextResponse.json({ error: 'week_start + week_end are required for weekly batches.' }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems.map(normalizeBatchItem).filter((r): r is NonNullable<typeof r> => r !== null);
  if (items.length === 0) {
    return NextResponse.json({ error: 'At least one employee line with a positive total is required.' }, { status: 400 });
  }

  const total = batchTotalCents(items);
  const label = typeof body.label === 'string' && body.label.trim()
    ? body.label.trim()
    : kind === 'weekly' && weekStart && weekEnd
      ? buildBatchLabel(new Date(`${weekStart}T00:00:00Z`), new Date(`${weekEnd}T00:00:00Z`))
      : `Ad-hoc batch ${new Date().toLocaleDateString()}`;

  const { data: batch, error: batchErr } = await supabaseAdmin
    .from('payout_batches')
    .insert({
      label,
      kind,
      week_start: weekStart,
      week_end: weekEnd,
      status: 'draft',
      total_cents: total,
      notes: typeof body.notes === 'string' ? body.notes : null,
      created_by: session.user.email ?? 'unknown',
    })
    .select('id, label, kind, status, total_cents')
    .single();
  if (batchErr || !batch) {
    return NextResponse.json({ error: batchErr?.message ?? 'Could not create batch' }, { status: 500 });
  }

  const insertRows = items.map((it) => ({ ...it, batch_id: batch.id }));
  const { error: itemErr } = await supabaseAdmin.from('payout_batch_items').insert(insertRows);
  if (itemErr) {
    // Roll back the batch row so we don't orphan a header without
    // lines. delete is fine — RLS service-role.
    await supabaseAdmin.from('payout_batches').delete().eq('id', batch.id);
    return NextResponse.json({ error: itemErr.message }, { status: 500 });
  }

  return NextResponse.json({ batch });
});
