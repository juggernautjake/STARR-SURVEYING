// app/api/admin/jobs/[id]/financials/route.ts — slice J3.
//
// One read that answers "where does the money stand on this job", instead of the three the Financial
// tab used to make (quote off the job row, payments from one route, nothing at all about invoices).
//
// ── WHY IT DOES NOT TRUST jobs.amount_paid ──────────────────────────────────────────────────────
//
// That column is a cache written by the payments route, and it was computed excluding refunds until
// 2026-08-14 — so a refunded job kept showing the money as received, and the job stayed `paid`.
// Recomputing from `job_payments` here means this endpoint cannot drift from the rows even if the
// cache does. The cache is still maintained for the jobs LIST, where summing payments per row would
// be a query per job.
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { summariseJobFinancials, type JobPaymentRow, type JobInvoiceRow } from '@/lib/jobs/financials';

export const runtime = 'nodejs';

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: jobId } = await ctx.params;

  const [{ data: job }, { data: payments }, { data: invoices }] = await Promise.all([
    supabaseAdmin.from('jobs').select('quote_amount, final_amount, payment_status').eq('id', jobId).maybeSingle(),
    supabaseAdmin.from('job_payments')
      .select('id, amount, payment_type, payment_method, reference_number, notes, paid_at, recorded_by')
      .eq('job_id', jobId).order('paid_at', { ascending: false }),
    supabaseAdmin.from('customer_invoices')
      .select('id, invoice_number, public_slug, status, total_cents, issued_at, due_at, paid_at')
      .eq('job_id', jobId).order('created_at', { ascending: false }),
  ]);

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const jobRow = job as { quote_amount: number | null; final_amount: number | null };
  const summary = summariseJobFinancials({
    quoteAmount: jobRow.quote_amount,
    finalAmount: jobRow.final_amount,
    payments: (payments ?? []) as JobPaymentRow[],
    invoices: (invoices ?? []) as JobInvoiceRow[],
  });

  return NextResponse.json({
    summary,
    payments: payments ?? [],
    invoices: invoices ?? [],
  }, { headers: { 'Cache-Control': 'no-store' } });
}
