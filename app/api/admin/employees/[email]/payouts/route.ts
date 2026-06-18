// app/api/admin/employees/[email]/payouts/route.ts
//
// P14 of payment-infrastructure-2026-06-18.md — per-employee payout
// history. Joins payout_batch_items + payout_batches so the profile
// page can show the audit trail without two round trips.
//
//   GET  /api/admin/employees/{email}/payouts → { payouts: [...] }
//
// Auth: admin OR the employee viewing themselves (employees should
// see their own pay history; admins see anyone's).
//
// Returns newest-first, capped at 100.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  // …/employees/<email>/payouts — email is the second-to-last segment.
  const targetEmail = decodeURIComponent(segments[segments.length - 2] ?? '').toLowerCase();
  if (!targetEmail) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 });
  }

  const viewer = (session.user.email ?? '').toLowerCase();
  if (viewer !== targetEmail && !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  interface RawItem {
    id: string;
    batch_id: string;
    user_email: string;
    user_name: string | null;
    hours_cents: number;
    bonuses_cents: number;
    reimbursements_cents: number;
    adjustments_cents: number;
    total_cents: number;
    method: string | null;
    method_handle: string | null;
    status: 'pending' | 'sent' | 'paid' | 'failed';
    external_ref: string | null;
    attempted_at: string | null;
    paid_at: string | null;
    failure_reason: string | null;
    notes: string | null;
    created_at: string;
  }
  interface RawBatch {
    id: string;
    label: string;
    kind: 'weekly' | 'ad_hoc';
    week_start: string | null;
    week_end: string | null;
    status: string;
  }

  const { data: items, error } = await supabaseAdmin
    .from('payout_batch_items')
    .select('id, batch_id, user_email, user_name, hours_cents, bonuses_cents, reimbursements_cents, adjustments_cents, total_cents, method, method_handle, status, external_ref, attempted_at, paid_at, failure_reason, notes, created_at')
    .eq('user_email', targetEmail)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const itemRows = (items ?? []) as RawItem[];

  const batchIds = Array.from(new Set(itemRows.map((i) => i.batch_id)));
  const batchMap = new Map<string, RawBatch>();
  if (batchIds.length > 0) {
    const { data: batches } = await supabaseAdmin
      .from('payout_batches')
      .select('id, label, kind, week_start, week_end, status')
      .in('id', batchIds);
    for (const b of (batches ?? []) as RawBatch[]) batchMap.set(b.id, b);
  }

  return NextResponse.json({
    payouts: itemRows.map((it) => ({
      ...it,
      batch: batchMap.get(it.batch_id) ?? null,
    })),
  });
});
