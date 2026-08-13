// app/api/admin/payouts/runs/[id]/ach-csv/route.ts
//
// P13 of payment-infrastructure-2026-06-18.md — generates a CSV
// containing every ACH item in the batch. Office uploads this to
// PNC's "Send Payments" / Bill Pay portal in lieu of NACHA encoding
// until the bank confirms its preferred format.
//
//   GET  /api/admin/payouts/runs/{id}/ach-csv → text/csv

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { buildAchCsv, type DispatchItem } from '@/lib/payouts/dispatch';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const id = segments[segments.length - 2];
  if (!id) return NextResponse.json({ error: 'Missing batch id' }, { status: 400 });

  const { data: batch } = await supabaseAdmin
    .from('payout_batches')
    .select('id, label, status')
    .eq('id', id)
    .maybeSingle();
  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  if (batch.status !== 'approved' && batch.status !== 'dispatched') {
    return NextResponse.json(
      { error: `ACH CSV only available for approved or dispatched batches (got "${batch.status}").` },
      { status: 409 },
    );
  }

  const { data: items } = await supabaseAdmin
    .from('payout_batch_items')
    // `recovered_cents` is selected because the CSV amount is total − recovered. Omitting it would
    // silently export the gross figure and pay back every advance the batch just withheld.
    .select('id, user_email, user_name, total_cents, recovered_cents, method, method_handle, status')
    .eq('batch_id', id)
    .eq('method', 'ach')
    // ── ALREADY-PAID ROWS MUST NOT BE IN THE FILE ───────────────────────────────────────────────
    //
    // This route is reachable while a batch is `dispatched` — i.e. mid-dispatch, which is exactly
    // when somebody re-downloads. `status` was selected and never used, so the second file contained
    // every ACH line again, including the ones already sent. Uploading it to the bank pays those
    // people a second time, and nothing downstream objects: marking an already-`paid` item `paid`
    // is a deliberate no-op, and the batch header only rolls forward.
    //
    // A `failed` row is deliberately still exported: it is a payment the bank rejected and the
    // person is still owed it, so it belongs in the next file.
    .neq('status', 'paid');
  const achItems = (items ?? []) as DispatchItem[];
  const csv = buildAchCsv(achItems, batch.label);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ach_${batch.label.replace(/[^A-Za-z0-9_-]/g, '_')}.csv"`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  });
});
