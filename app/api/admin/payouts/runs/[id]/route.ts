// app/api/admin/payouts/runs/[id]/route.ts
//
// P12 of payment-infrastructure-2026-06-18.md — detail view of a
// single batch + its line items. Backs the admin detail page used
// for review-before-approval.
//
//   GET  /api/admin/payouts/runs/{id}  → { batch, items }

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  // …/payouts/runs/<id> — id is the last segment.
  const id = segments[segments.length - 1];
  if (!id) {
    return NextResponse.json({ error: 'Missing batch id' }, { status: 400 });
  }

  const { data: batch, error: batchErr } = await supabaseAdmin
    .from('payout_batches')
    .select('id, label, kind, week_start, week_end, status, total_cents, notes, created_by, approved_by, approved_at, approval_ip, dispatched_at, completed_at, voided_at, voided_by, created_at')
    .eq('id', id)
    .maybeSingle();
  if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 500 });
  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });

  const { data: items, error: itemsErr } = await supabaseAdmin
    .from('payout_batch_items')
    .select('id, user_email, user_name, hours_cents, bonuses_cents, reimbursements_cents, adjustments_cents, total_cents, method, method_handle, status, external_ref, paid_at, failure_reason, notes')
    .eq('batch_id', id)
    .order('user_email', { ascending: true });
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  return NextResponse.json({ batch, items: items ?? [] });
});
