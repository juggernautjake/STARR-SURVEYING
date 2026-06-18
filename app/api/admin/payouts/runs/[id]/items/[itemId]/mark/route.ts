// app/api/admin/payouts/runs/[id]/items/[itemId]/mark/route.ts
//
// P13 of payment-infrastructure-2026-06-18.md — per-line item state
// machine. The dispatch page calls this to flip an item between
// pending / sent / paid / failed as the office works the list.
//
//   POST  /api/admin/payouts/runs/{id}/items/{itemId}/mark
//     body: {
//       status: 'sent' | 'paid' | 'failed' | 'pending',
//       external_ref?: string,
//       failure_reason?: string,
//     }
//
// Side effect: after the row is updated, we recompute the batch
// status via `batchStatusFromItems` so the header rolls forward to
// `dispatched` / `completed` without a separate cron.
//
// Guard: the batch must be in `approved` or `dispatched` status —
// you can't mark items on a draft / voided batch.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  batchStatusFromItems,
  type PayoutBatchStatus,
  type PayoutItemStatus,
} from '@/lib/payouts/dispatch';

const ALLOWED: PayoutItemStatus[] = ['sent', 'paid', 'failed', 'pending'];

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  // …/runs/<id>/items/<itemId>/mark — mark is last, itemId is -2, id is -4.
  const itemId = segments[segments.length - 2];
  const batchId = segments[segments.length - 4];
  if (!itemId || !batchId) {
    return NextResponse.json({ error: 'Missing ids' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    status?: PayoutItemStatus;
    external_ref?: string;
    failure_reason?: string;
  };
  if (!body.status || !(ALLOWED as string[]).includes(body.status)) {
    return NextResponse.json({ error: 'Unsupported status' }, { status: 400 });
  }

  const { data: batch } = await supabaseAdmin
    .from('payout_batches')
    .select('id, status')
    .eq('id', batchId)
    .maybeSingle();
  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  if (batch.status !== 'approved' && batch.status !== 'dispatched') {
    return NextResponse.json(
      { error: `Cannot mark items on a batch in status "${batch.status}".` },
      { status: 409 },
    );
  }

  // Fetch the current row so we know whether this is the FIRST
  // non-pending transition (stamps attempted_at on the way out of
  // pending; subsequent state shuffles don't re-stamp).
  const { data: currentItem } = await supabaseAdmin
    .from('payout_batch_items')
    .select('attempted_at, paid_at, status')
    .eq('id', itemId)
    .eq('batch_id', batchId)
    .maybeSingle();
  const nowIso = new Date().toISOString();

  const updates: Record<string, unknown> = {
    status: body.status,
  };
  if (body.status === 'sent' || body.status === 'paid' || body.status === 'failed') {
    // First non-pending transition stamps attempted_at — even if it
    // was a failure. Subsequent changes preserve the original.
    if (!currentItem?.attempted_at) {
      updates.attempted_at = nowIso;
    }
  }
  if (body.status === 'sent' || body.status === 'paid') {
    updates.external_ref = body.external_ref?.slice(0, 200) ?? null;
    updates.failure_reason = null;
  }
  if (body.status === 'paid') {
    // P22 QA — preserve the ORIGINAL paid_at on subsequent flips
    // so the audit trail anchors to the first clear. The mark
    // route can be called multiple times (e.g. office updates
    // external_ref after the row is already paid).
    if (!currentItem?.paid_at) {
      updates.paid_at = nowIso;
    }
  }
  if (body.status === 'pending') {
    updates.external_ref = null;
    updates.failure_reason = null;
    updates.paid_at = null;
    // Re-opening to pending clears attempted_at so a successful
    // retry stamps fresh.
    updates.attempted_at = null;
  }
  if (body.status === 'failed') {
    updates.failure_reason = body.failure_reason?.slice(0, 500) ?? null;
  }

  const { error: itemErr } = await supabaseAdmin
    .from('payout_batch_items')
    .update(updates)
    .eq('id', itemId)
    .eq('batch_id', batchId);
  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });

  // Recompute parent batch status from the items.
  const { data: items } = await supabaseAdmin
    .from('payout_batch_items')
    .select('status')
    .eq('batch_id', batchId);
  const nextBatchStatus = batchStatusFromItems(
    (items ?? []) as Array<{ status: PayoutItemStatus }>,
    batch.status as PayoutBatchStatus,
  );
  if (nextBatchStatus !== batch.status) {
    const stamps: Record<string, unknown> = { status: nextBatchStatus };
    if (nextBatchStatus === 'dispatched') stamps.dispatched_at = new Date().toISOString();
    if (nextBatchStatus === 'completed') stamps.completed_at = new Date().toISOString();
    await supabaseAdmin.from('payout_batches').update(stamps).eq('id', batchId);
  }

  return NextResponse.json({ item_status: body.status, batch_status: nextBatchStatus });
});
