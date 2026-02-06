// app/api/admin/payroll/balance/route.ts — Balance & withdrawal management
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

// GET: Get balance info and transaction history
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const type = searchParams.get('type') || 'summary'; // summary, transactions, withdrawals
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  const targetEmail = email || session.user.email;

  if (!isAdmin(session.user.email) && targetEmail !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (type === 'summary' || type === 'all') {
    const { data: profile } = await supabaseAdmin
      .from('employee_profiles')
      .select('available_balance, total_earned, total_withdrawn, bank_name, bank_account_last4, bank_verified')
      .eq('user_email', targetEmail)
      .single();

    const { data: pendingWithdrawals } = await supabaseAdmin
      .from('withdrawal_requests')
      .select('amount')
      .eq('user_email', targetEmail)
      .in('status', ['pending', 'approved', 'processing']);

    const pendingAmount = (pendingWithdrawals || []).reduce(
      (sum: number, w: { amount: number }) => sum + w.amount, 0
    );

    if (type === 'summary') {
      return NextResponse.json({
        balance: profile?.available_balance || 0,
        total_earned: profile?.total_earned || 0,
        total_withdrawn: profile?.total_withdrawn || 0,
        pending_withdrawals: pendingAmount,
        available_for_withdrawal: (profile?.available_balance || 0) - pendingAmount,
        bank_linked: !!profile?.bank_account_last4,
        bank_name: profile?.bank_name,
        bank_account_last4: profile?.bank_account_last4,
        bank_verified: profile?.bank_verified || false,
      });
    }
  }

  if (type === 'transactions' || type === 'all') {
    const { data, error } = await supabaseAdmin
      .from('balance_transactions')
      .select('*')
      .eq('user_email', targetEmail)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (type === 'transactions') return NextResponse.json({ transactions: data || [] });
  }

  if (type === 'withdrawals' || type === 'all') {
    const { data, error } = await supabaseAdmin
      .from('withdrawal_requests')
      .select('*')
      .eq('user_email', targetEmail)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (type === 'withdrawals') return NextResponse.json({ withdrawals: data || [] });
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
}

// POST: Request a withdrawal
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { amount, destination = 'bank_account', notes } = body;

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Valid amount required' }, { status: 400 });
  }

  // Check available balance
  const { data: profile } = await supabaseAdmin
    .from('employee_profiles')
    .select('available_balance, bank_name, bank_account_last4, bank_verified')
    .eq('user_email', session.user.email)
    .single();

  if (!profile) return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 });

  // Check pending withdrawals
  const { data: pending } = await supabaseAdmin
    .from('withdrawal_requests')
    .select('amount')
    .eq('user_email', session.user.email)
    .in('status', ['pending', 'approved', 'processing']);

  const pendingAmount = (pending || []).reduce(
    (sum: number, w: { amount: number }) => sum + w.amount, 0
  );

  const availableForWithdrawal = profile.available_balance - pendingAmount;

  if (amount > availableForWithdrawal) {
    return NextResponse.json({
      error: `Insufficient balance. Available: $${availableForWithdrawal.toFixed(2)}`,
    }, { status: 400 });
  }

  if (destination === 'bank_account' && !profile.bank_account_last4) {
    return NextResponse.json({ error: 'No bank account linked. Please add bank details first.' }, { status: 400 });
  }

  const { data: request, error } = await supabaseAdmin
    .from('withdrawal_requests')
    .insert({
      user_email: session.user.email,
      amount,
      destination,
      bank_name: profile.bank_name,
      bank_account_last4: profile.bank_account_last4,
      status: 'pending',
      notes,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log activity
  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'withdrawal_requested',
      entity_type: 'withdrawal_request',
      entity_id: request.id,
      metadata: { amount, destination },
    });
  } catch { /* ignore */ }

  return NextResponse.json({ request }, { status: 201 });
}

// PUT: Approve/reject/process withdrawal (admin only) or cancel own (employee)
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, action, rejection_reason } = body;
  if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 });

  // Get the request
  const { data: request } = await supabaseAdmin
    .from('withdrawal_requests')
    .select('*')
    .eq('id', id)
    .single();

  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Employee can cancel their own pending request
  if (action === 'cancel') {
    if (request.user_email !== session.user.email && !isAdmin(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (request.status !== 'pending') {
      return NextResponse.json({ error: 'Can only cancel pending requests' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('withdrawal_requests')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ request: data });
  }

  // Admin actions
  if (!isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  if (action === 'approve') {
    const { data, error } = await supabaseAdmin
      .from('withdrawal_requests')
      .update({ status: 'approved', reviewed_by: session.user.email, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ request: data });
  }

  if (action === 'reject') {
    const { data, error } = await supabaseAdmin
      .from('withdrawal_requests')
      .update({
        status: 'rejected',
        reviewed_by: session.user.email,
        reviewed_at: new Date().toISOString(),
        rejection_reason,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ request: data });
  }

  if (action === 'process') {
    // Actually process the withdrawal — deduct from balance
    const { data: profile } = await supabaseAdmin
      .from('employee_profiles')
      .select('available_balance, total_withdrawn')
      .eq('user_email', request.user_email)
      .single();

    if (!profile || profile.available_balance < request.amount) {
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
    }

    const balanceBefore = profile.available_balance;
    const balanceAfter = balanceBefore - request.amount;

    // Create balance transaction
    const { data: tx } = await supabaseAdmin
      .from('balance_transactions')
      .insert({
        user_email: request.user_email,
        transaction_type: 'withdrawal',
        amount: -request.amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: `Withdrawal to ${request.destination}`,
        reference_type: 'withdrawal_request',
        reference_id: id,
        status: 'completed',
        processed_at: new Date().toISOString(),
      })
      .select()
      .single();

    // Update employee balance
    await supabaseAdmin
      .from('employee_profiles')
      .update({
        available_balance: balanceAfter,
        total_withdrawn: (profile.total_withdrawn || 0) + request.amount,
      })
      .eq('user_email', request.user_email);

    // Update withdrawal request
    const { data, error } = await supabaseAdmin
      .from('withdrawal_requests')
      .update({
        status: 'completed',
        processed_at: new Date().toISOString(),
        transaction_id: tx?.id,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ request: data, new_balance: balanceAfter });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
