// app/api/admin/jobs/payments/route.ts — Payment tracking
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notifyJobEvent } from '@/lib/notifications/job-event';

/** Dollars, for a notification banner. Cents matter on an invoice and are noise on a phone. */
function money(n: number): string {
  return `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('job_id');
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('job_payments')
    .select('*')
    .eq('job_id', jobId)
    .order('paid_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const totalPaid = (data || [])
    .filter((p: { payment_type: string }) => p.payment_type !== 'refund')
    .reduce((sum: number, p: { amount: number }) => sum + (p.amount || 0), 0);
  const totalRefunded = (data || [])
    .filter((p: { payment_type: string }) => p.payment_type === 'refund')
    .reduce((sum: number, p: { amount: number }) => sum + (p.amount || 0), 0);

  return NextResponse.json({
    payments: data || [],
    total_paid: totalPaid,
    total_refunded: totalRefunded,
    net_paid: totalPaid - totalRefunded,
  });
}, { routeName: 'jobs/payments' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { job_id, amount, payment_type, payment_method, reference_number, notes, paid_at } = await req.json();
  if (!job_id || !amount) return NextResponse.json({ error: 'job_id and amount required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('job_payments')
    .insert({
      job_id, amount, payment_type: payment_type || 'payment',
      payment_method, reference_number, notes,
      paid_at: paid_at || new Date().toISOString(),
      recorded_by: session.user.email,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update job payment totals
  const { data: allPayments } = await supabaseAdmin
    .from('job_payments')
    .select('amount, payment_type')
    .eq('job_id', job_id);

  // ── A REFUND USED TO NOT COUNT (J3, 2026-08-14) ─────────────────────────────────────────────
  //
  // This summed everything that was not a refund and wrote it to `jobs.amount_paid` — so recording
  // a refund LEFT THE JOB SHOWING THE MONEY AS STILL RECEIVED. The job stayed `paid`, the dashboard
  // kept counting the revenue, and the only place the refund appeared was the payments list nobody
  // had a screen for. The GET above already netted them off, which is how the two disagreed.
  const rows = (allPayments || []) as Array<{ amount: number; payment_type: string }>;
  const received = rows.filter((p) => p.payment_type !== 'refund').reduce((s, p) => s + (p.amount || 0), 0);
  const refunded = rows.filter((p) => p.payment_type === 'refund').reduce((s, p) => s + (p.amount || 0), 0);
  const totalPaid = received - refunded;

  // Get job quote for status
  const { data: job } = await supabaseAdmin.from('jobs').select('quote_amount, final_amount, job_number, name').eq('id', job_id).single();
  const owed = (job?.final_amount || job?.quote_amount || 0);
  let paymentStatus = 'unpaid';
  if (totalPaid >= owed && owed > 0) paymentStatus = 'paid';
  else if (totalPaid > 0) paymentStatus = 'partial';

  await supabaseAdmin.from('jobs').update({
    amount_paid: totalPaid,
    payment_status: paymentStatus,
  }).eq('id', job_id);

  // N3 — money arriving is one of the events that changes what people do: it is what closes a job
  // out, and the crew lead chasing a client needs to know it landed before they call again.
  const isRefund = (payment_type || 'payment') === 'refund';
  const outstanding = Math.max(0, owed - totalPaid);
  await notifyJobEvent(job_id, {
    kind: 'payment_recorded',
    title: `${isRefund ? 'refund' : 'payment'} recorded — ${money(amount)}`,
    body: owed > 0
      ? `${money(totalPaid)} of ${money(owed)} received${outstanding > 0 ? `, ${money(outstanding)} still outstanding.` : ' — paid in full.'}`
      : undefined,
    link: `/admin/jobs/${job_id}?tab=financial`,
  }, session.user.email);

  return NextResponse.json({ payment: data }, { status: 201 });
}, { routeName: 'jobs/payments' });
