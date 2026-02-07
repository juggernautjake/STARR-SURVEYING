// app/api/admin/payroll/payout-log/route.ts — Comprehensive payout log
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// GET: Fetch payout log entries
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const type = searchParams.get('type'); // filter by payout_type
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
  const offset = parseInt(searchParams.get('offset') || '0');
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');

  const admin = isAdmin(session.user.email);

  let query = supabaseAdmin
    .from('payout_log')
    .select('*', { count: 'exact' })
    .order('processed_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Non-admins can only see their own
  if (!admin) {
    query = query.eq('user_email', session.user.email);
  } else if (email) {
    query = query.eq('user_email', email);
  }

  if (type) query = query.eq('payout_type', type);
  if (dateFrom) query = query.gte('processed_at', dateFrom);
  if (dateTo) query = query.lte('processed_at', dateTo + 'T23:59:59');

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Compute summary stats
  const entries = data || [];
  const totalPaid = entries.reduce((s: number, e: { amount: number; status: string }) => e.status === 'completed' && e.amount > 0 ? s + e.amount : s, 0);
  const totalDeductions = entries.reduce((s: number, e: { amount: number; status: string }) => e.status === 'completed' && e.amount < 0 ? s + Math.abs(e.amount) : s, 0);

  return NextResponse.json({
    entries,
    total: count || 0,
    summary: { total_paid: totalPaid, total_deductions: totalDeductions },
  });
}, { routeName: 'payroll/payout-log' });

// POST: Create a payout log entry (admin only)
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { user_email, payout_type, amount, reason, details, source_type, source_id } = body;

  if (!user_email || !payout_type || amount === undefined || !reason) {
    return NextResponse.json({ error: 'user_email, payout_type, amount, reason required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from('payout_log').insert({
    user_email, payout_type, amount, reason,
    details: details || null,
    source_type: source_type || 'admin_manual',
    source_id: source_id || null,
    processed_by: session.user.email,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify employee
  await supabaseAdmin.from('notifications').insert({
    user_email,
    type: 'payout',
    title: `Payment: $${Math.abs(amount).toFixed(2)}`,
    body: reason,
    icon: amount > 0 ? '💰' : '📉',
    link: '/admin/my-pay',
    source_type: 'payroll',
    source_id: data.id,
  });

  return NextResponse.json({ data });
}, { routeName: 'payroll/payout-log' });
