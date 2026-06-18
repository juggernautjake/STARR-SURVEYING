// app/api/admin/payouts/runs/[id]/void/route.ts
//
// P12 of payment-infrastructure-2026-06-18.md — cancel a batch
// before dispatch. Any admin can void a draft / approved batch;
// dispatched + completed batches cannot be voided (they'd need a
// per-item refund flow which is out of scope for the approval
// slice).
//
//   POST  /api/admin/payouts/runs/{id}/void  application/json
//     body: { reason?: string }

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const id = segments[segments.length - 2];
  if (!id) {
    return NextResponse.json({ error: 'Missing batch id' }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { reason?: string };

  const { data: batch } = await supabaseAdmin
    .from('payout_batches')
    .select('id, status, notes')
    .eq('id', id)
    .maybeSingle();
  if (!batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }
  if (batch.status !== 'draft' && batch.status !== 'approved') {
    return NextResponse.json(
      { error: `Cannot void a batch in status "${batch.status}".` },
      { status: 409 },
    );
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
  const stitchedNotes = reason
    ? `${batch.notes ? `${batch.notes}\n\n` : ''}Voided: ${reason}`
    : batch.notes;

  const { error } = await supabaseAdmin
    .from('payout_batches')
    .update({
      status: 'voided',
      voided_at: new Date().toISOString(),
      voided_by: session.user.email ?? null,
      notes: stitchedNotes,
    })
    .eq('id', batch.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ voided: true });
});
