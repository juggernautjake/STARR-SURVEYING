// app/api/admin/receipts/mine/route.ts — the receipts YOU submitted.
//
// R1 opened receipt capture to everyone at the firm. Nobody except a bookkeeper could then see what
// happened to what they submitted: `/admin/receipts` is the approval queue and is correctly limited
// to admin / developer / tech_support. So the flow ended in a void — you photograph a receipt, it
// vanishes, and weeks later you have no idea whether it was approved, rejected, or lost.
//
// Submitting into a void is most of why people stop submitting. This route is the other half of R1.
//
// ── THE SECURITY SHAPE, WHICH IS THE WHOLE POINT ───────────────────────────────────────────────
//
// It takes NO user parameter. Not an optional one, not an admin-only one — none. The identity comes
// from the session, is resolved to an `auth.users.id` server-side, and the query is pinned to it.
// A route that accepts `?user=` and checks whether you are allowed to use it is one forgotten check
// away from handing over somebody else's vendor names, totals and card last-fours; a route that
// cannot express the question at all is not.
//
// Bookkeepers are not special-cased here either. They already have `/admin/receipts`, which answers
// a different question with its own gate. Two ways into the same data is how one of them stops
// being audited.

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

/** Enough to answer "what did I send and what happened to it", and nothing more. Deliberately
 *  narrower than the bookkeeper queue's `select('*')`: this list is read on a phone, and the fields
 *  it omits (tax flags, approver identity, extraction cost) are not the submitter's business. */
const SELECT_COLS =
  'id, vendor_name, total_cents, transaction_at, created_at, status, rejected_reason, ' +
  'extraction_status, extraction_error, category, job_id';

export interface MyReceiptRow {
  id: string;
  vendor_name: string | null;
  total_cents: number | null;
  transaction_at: string | null;
  created_at: string;
  status: string;
  rejected_reason: string | null;
  extraction_status: string | null;
  extraction_error: string | null;
  category: string | null;
  job_id: string | null;
  job_label: string | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10)));

  // Session email → auth.users.id. Same `listUsers` pattern as the upload route, so a change to how
  // this firm's accounts are provisioned lands in one shape rather than several.
  const { data: users, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (usersErr) {
    console.error('[admin/receipts/mine] listUsers failed', { error: usersErr.message });
    return NextResponse.json({ error: 'Could not resolve your account.' }, { status: 500 });
  }
  const me = users?.users.find(
    (u) => u.email?.toLowerCase() === session.user!.email!.toLowerCase(),
  );
  if (!me) {
    // Not an error state worth a 500: it means the login exists but no auth.users row does, which
    // is the same condition the upload route reports, in the same words.
    return NextResponse.json({ receipts: [], unprovisioned: true });
  }

  const { data: rows, error } = await supabaseAdmin
    .from('receipts')
    .select(SELECT_COLS)
    .eq('user_id', me.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[admin/receipts/mine] list failed', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const receipts = (rows ?? []) as Array<Omit<MyReceiptRow, 'job_label'>>;

  // One batched job lookup for the page, matching the queue's approach — never a fetch per row.
  const jobIds = Array.from(
    new Set(receipts.map((r) => r.job_id).filter((v): v is string => typeof v === 'string')),
  );
  const jobLabels = new Map<string, string>();
  if (jobIds.length > 0) {
    const { data: jobs } = await supabaseAdmin
      .from('jobs')
      .select('id, name, job_number')
      .in('id', jobIds);
    for (const j of (jobs ?? []) as Array<{
      id: string;
      name: string | null;
      job_number: string | null;
    }>) {
      jobLabels.set(j.id, j.job_number ? `${j.job_number} · ${j.name ?? ''}`.trim() : (j.name ?? ''));
    }
  }

  return NextResponse.json({
    receipts: receipts.map((r) => ({
      ...r,
      job_label: r.job_id ? (jobLabels.get(r.job_id) ?? null) : null,
    })),
  });
}, { routeName: 'admin/receipts/mine' });
