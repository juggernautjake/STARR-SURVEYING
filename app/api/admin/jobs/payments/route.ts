// app/api/admin/jobs/payments/route.ts — Payment tracking
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
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
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
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

  const totalPaid = (allPayments || [])
    .filter((p: { payment_type: string }) => p.payment_type !== 'refund')
    .reduce((sum: number, p: { amount: number }) => sum + (p.amount || 0), 0);

  // Get job quote for status
  const { data: job } = await supabaseAdmin.from('jobs').select('quote_amount, final_amount').eq('id', job_id).single();
  const owed = (job?.final_amount || job?.quote_amount || 0);
  let paymentStatus = 'unpaid';
  if (totalPaid >= owed && owed > 0) paymentStatus = 'paid';
  else if (totalPaid > 0) paymentStatus = 'partial';

  await supabaseAdmin.from('jobs').update({
    amount_paid: totalPaid,
    payment_status: paymentStatus,
  }).eq('id', job_id);

  return NextResponse.json({ payment: data }, { status: 201 });
}
