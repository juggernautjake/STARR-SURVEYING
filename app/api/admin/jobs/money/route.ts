// app/api/admin/jobs/money/route.ts — one job's money, and the firm's.
//
//   GET /api/admin/jobs/money?job_id=<id>   → { summary, payments, priceHistory, reconcile }
//   GET /api/admin/jobs/money?project_id=…  → the same, rolled up across a project's jobs
//   GET /api/admin/jobs/money               → the firm-wide roll-up for the financial pages
//
// Owner, 2026-08-19: *"make sure that this is all wired up correctly with our financial pages
// properly so we can fully keep track of what we have bid and what we have spent and what we have
// received."*
//
// ── WHY THE ARITHMETIC IS NOT DONE HERE ─────────────────────────────────────────────────────────
//
// Every rule lives in `lib/jobs/money.ts` and this route only fetches rows and calls it. "What is
// this job worth?" has three plausible answers that disagree — the quote, the final amount, and the
// sum of payments — and a screen that picks one on its own eventually picks a different one from
// the screen next to it. Then the job page and the financial page report different numbers for the
// same job, which is worse than either being wrong, because nothing tells you which to believe.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler, dbErrorResponse } from '@/lib/apiErrorHandler';
import { summarise, reconcile, rollUpJobs, type PaymentRow } from '@/lib/jobs/money';

const JOB_COLS = 'id, job_number, name, project_id, stage, quote_amount, final_amount, amount_paid, result, result_reason, amount_retained, cancelled_at, deleted_at';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('job_id');
  const projectId = searchParams.get('project_id');

  // ── One job, in full ─────────────────────────────────────────────────────────────────────────
  if (jobId) {
    const { data: job, error } = await supabaseAdmin.from('jobs').select(JOB_COLS).eq('id', jobId).maybeSingle();
    if (error) return dbErrorResponse(error, 'load the job');
    if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });

    const [{ data: payments }, { data: history }] = await Promise.all([
      supabaseAdmin.from('job_payments')
        .select('id, amount, payment_type, payment_method, reference_number, notes, paid_at, recorded_by')
        .eq('job_id', jobId).order('paid_at', { ascending: false }),
      supabaseAdmin.from('job_price_history')
        .select('id, field, old_amount, new_amount, reason, changed_by, created_at')
        .eq('job_id', jobId).order('created_at', { ascending: false }),
    ]);

    const withPayments = { ...(job as object), payments: (payments ?? []) as PaymentRow[] };
    return NextResponse.json({
      job,
      summary: summarise(withPayments),
      // Surfaced, not silently resolved: `jobs.amount_paid` predates `job_payments` and is still
      // written by older paths. A number that is quietly wrong is the one that gets believed.
      reconcile: reconcile(withPayments),
      payments: payments ?? [],
      priceHistory: history ?? [],
    });
  }

  // ── A project's jobs, or the whole firm ──────────────────────────────────────────────────────
  let q = supabaseAdmin.from('jobs').select(JOB_COLS).is('deleted_at', null);
  if (projectId) q = q.eq('project_id', projectId);
  const { data: jobs, error } = await q.limit(2000);
  if (error) return dbErrorResponse(error, 'load jobs');

  const rows = (jobs ?? []) as unknown as Array<Record<string, unknown> & { id: string }>;
  const ids = rows.map((j) => j.id);
  const byJob = new Map<string, PaymentRow[]>();
  if (ids.length > 0) {
    // One query for every payment on the page — per-job queries would be N+1 on a list whose whole
    // purpose is to be totalled.
    const { data: pays } = await supabaseAdmin
      .from('job_payments').select('job_id, amount, payment_type, paid_at').in('job_id', ids);
    for (const p of (pays ?? []) as Array<PaymentRow & { job_id: string }>) {
      const list = byJob.get(p.job_id);
      if (list) list.push(p);
      else byJob.set(p.job_id, [p]);
    }
  }

  const enriched = rows.map((j) => ({ ...j, payments: byJob.get(j.id) ?? [] }));
  const totals = rollUpJobs(enriched);

  // ── Payments made against the PROJECT rather than a job (2026-08-19) ─────────────────────────
  //
  // A retainer, or one cheque covering several jobs. Those rows have `job_id IS NULL`, so the
  // per-job loop above cannot see them — and leaving them out would understate what the client has
  // actually paid, which is the single number this endpoint exists to get right.
  let projectPayments: PaymentRow[] = [];
  if (projectId) {
    const { data: pp } = await supabaseAdmin
      .from('job_payments').select('amount, payment_type, paid_at')
      .eq('project_id', projectId).is('job_id', null);
    projectPayments = (pp ?? []) as PaymentRow[];
  }
  const directReceived = projectPayments.reduce(
    (a, p) => a + (p.payment_type === 'refund' ? -Math.abs(Number(p.amount) || 0) : (Number(p.amount) || 0)),
    0,
  );
  const received = Math.round((totals.received + directReceived) * 100) / 100;

  return NextResponse.json({
    totals: {
      ...totals,
      received,
      // What is still owed after everything the client has paid, however it was filed.
      outstanding: Math.round(Math.max(0, totals.billed - received) * 100) / 100,
      direct_payments: Math.round(directReceived * 100) / 100,
    },
    projectPayments,
    jobs: enriched.map((j) => ({ ...j, summary: summarise(j) })),
  });
}, { routeName: 'jobs/money' });
