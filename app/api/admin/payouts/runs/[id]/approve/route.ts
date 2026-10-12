// app/api/admin/payouts/runs/[id]/approve/route.ts
//
// P12 of payment-infrastructure-2026-06-18.md — payout-admin
// approval. Flips a draft batch → approved + stamps the approval
// signature (admin email + timestamp + IP).
//
//   POST  /api/admin/payouts/runs/{id}/approve
//
// Gate: `canApprovePayoutBatch` — env-driven allowlist OR admin
// role. Returns 403 when the signed-in user isn't a payout admin.
// Refuses to re-approve a non-draft batch with 409.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { canApprovePayoutBatch, extractRequestIp } from '@/lib/payouts/approval';
import { loadPayoutSettings } from '@/lib/payouts/server';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!canApprovePayoutBatch(session?.user, isAdmin)) {
    return NextResponse.json(
      { error: 'Only the designated payout admin can approve a batch.' },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  // …/payouts/runs/<id>/approve — id is the second-to-last segment.
  const id = segments[segments.length - 2];
  if (!id) {
    return NextResponse.json({ error: 'Missing batch id' }, { status: 400 });
  }

  const { data: batch } = await supabaseAdmin
    .from('payout_batches')
    .select('id, status, created_by')
    .eq('id', id)
    .maybeSingle();
  if (!batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }
  if (batch.status !== 'draft') {
    return NextResponse.json({ error: `Cannot approve a batch in status "${batch.status}".` }, { status: 409 });
  }

  const approver = session?.user?.email ?? null;
  // Separation of duties — when the firm turns on two-person approval (Payout settings, seed 677),
  // the person who built the batch cannot approve it. Off by default since 2026-10-11: one boss runs
  // payroll. PAYOUT_ADMIN_SELF_APPROVE still overrides for development.
  const { two_person_approval } = await loadPayoutSettings();
  if (two_person_approval && approver && batch.created_by === approver && !process.env.PAYOUT_ADMIN_SELF_APPROVE) {
    return NextResponse.json(
      { error: 'A payout batch must be approved by a different admin than the one who created it.' },
      { status: 409 },
    );
  }

  const { error } = await supabaseAdmin
    .from('payout_batches')
    .update({
      status: 'approved',
      approved_by: approver,
      approved_at: new Date().toISOString(),
      approval_ip: extractRequestIp(req.headers),
    })
    .eq('id', batch.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ approved: true, approved_by: approver });
});
