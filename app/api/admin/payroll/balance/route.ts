// app/api/admin/payroll/balance/route.ts — Balance & withdrawal management
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin, canHandleMoney } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import { buildWithdrawalNotification } from '@/lib/notifications/withdrawal';
import { checkBalanceIntegrity, type LedgerEntry } from '@/lib/payroll/balance-integrity';

// GET: Get balance info and transaction history
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const type = searchParams.get('type') || 'summary'; // summary, transactions, withdrawals, queue
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  // ── THE QUEUE (owner request, 2026-08-12) ─────────────────────────────────────────────────────
  //
  // Every other read here is pinned to ONE person, which is right for an employee looking at their
  // own money and is why no page could ever show the requests waiting for a decision. The API has
  // had `approve`, `reject` and `process` since it was written and nothing has ever listed what
  // there was to approve — so a request went into a void, exactly as submitting hours used to.
  if (type === 'queue') {
    if (!canHandleMoney(session.user.roles)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { data, error } = await supabaseAdmin
      .from('withdrawal_requests')
      .select('*')
      // Open requests first, and the settled ones after: a queue that hides what was decided
      // yesterday cannot answer "did anybody already handle this?".
      .order('requested_at', { ascending: false, nullsFirst: false })
      .limit(Math.max(1, Math.min(200, limit)));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as Array<{ user_email: string; status: string }>;
    const OPEN = new Set(['pending', 'approved', 'processing']);

    // The balance each request is drawn against, so an approver can see whether it is still covered
    // without opening a second screen per person. One query for the page, never one per row.
    const emails = Array.from(new Set(rows.filter((r) => OPEN.has(r.status)).map((r) => r.user_email)));
    const balances: Record<string, number> = {};
    const integrity: Record<string, string> = {};
    if (emails.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('employee_profiles')
        .select('user_email, available_balance')
        .in('user_email', emails);
      for (const p of (profiles ?? []) as Array<{ user_email: string; available_balance: number | null }>) {
        balances[p.user_email] = Number(p.available_balance ?? 0);
      }

      // ── DOES THE BALANCE MATCH ITS OWN LEDGER? ────────────────────────────────────────────────
      //
      // `available_balance` is a running total written by three separate paths, each a
      // read-modify-write with no transaction around it. Nothing has ever checked it against
      // `balance_transactions`, and a drifted balance does not look wrong — it is a plausible
      // amount of money on the right person.
      //
      // Checked HERE because this is the screen where somebody is about to send money against that
      // number, which is the last useful moment to find out it cannot be derived from anything.
      const { data: ledger } = await supabaseAdmin
        .from('balance_transactions')
        .select('user_email, amount, status')
        .in('user_email', emails);
      const byUser = new Map<string, LedgerEntry[]>();
      for (const t of (ledger ?? []) as Array<{ user_email: string; amount: number; status: string | null }>) {
        const list = byUser.get(t.user_email) ?? [];
        list.push({ amount: Number(t.amount), status: t.status });
        byUser.set(t.user_email, list);
      }
      for (const email of emails) {
        const check = checkBalanceIntegrity(balances[email], byUser.get(email) ?? []);
        if (check.needsReview && check.message) integrity[email] = check.message;
      }
    }

    return NextResponse.json({ withdrawals: rows, balances, integrity });
  }

  const targetEmail = email || session.user.email;

  // Your own money, always. Somebody ELSE's takes the money-handling role — this is the read the
  // owner named: *"Only people with money handling permissions will be able to see the accounts of
  // the employees."*
  if (!canHandleMoney(session.user.roles) && targetEmail !== session.user.email) {
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
}, { routeName: 'payroll/balance' });

// POST: Request a withdrawal
export const POST = withErrorHandler(async (req: NextRequest) => {
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
}, { routeName: 'payroll/balance' });

// PUT: Approve/reject/process withdrawal (admin only) or cancel own (employee)
export const PUT = withErrorHandler(async (req: NextRequest) => {
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
    if (request.user_email !== session.user.email && !isAdmin(session.user.roles)) {
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
    await tellThem(data, 'cancelled');
    return NextResponse.json({ request: data });
  }

  // Deciding a withdrawal moves money, so it takes the money-handling role rather than plain admin.
  if (!canHandleMoney(session.user.roles)) {
    return NextResponse.json({ error: 'You do not have permission to handle money.' }, { status: 403 });
  }

  if (action === 'approve') {
    // Only from `pending`. Without this, approving twice is possible, and approving something
    // already rejected or already sent silently reopens it — on a row whose whole purpose is to
    // record that a decision was made.
    if (request.status !== 'pending') {
      return NextResponse.json(
        { error: `This request is already ${request.status}.` },
        { status: 409 },
      );
    }

    // The balance is re-checked HERE, not only when the request was made. Hours can be paid out, an
    // earlier withdrawal can complete, and a correction can land between somebody asking for money
    // and somebody approving it — so the figure that mattered at request time is not the figure that
    // matters now.
    const { data: profile } = await supabaseAdmin
      .from('employee_profiles')
      .select('available_balance')
      .eq('user_email', request.user_email)
      .single();
    const available = Number(profile?.available_balance ?? 0);
    if (available < Number(request.amount)) {
      return NextResponse.json(
        { error: `Their balance is now $${available.toFixed(2)}, which does not cover $${Number(request.amount).toFixed(2)}.` },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from('withdrawal_requests')
      .update({ status: 'approved', reviewed_by: session.user.email, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await tellThem(data, 'approved');
    return NextResponse.json({ request: data });
  }

  if (action === 'reject') {
    // Required, mirroring the hours rejection. "Your withdrawal was declined" with no reason is a
    // dead end about somebody's wages, and the person cannot even tell whether to ask again.
    if (!String(rejection_reason ?? '').trim()) {
      return NextResponse.json(
        { error: 'Give a reason — the employee is told, and a refusal with no reason leaves them nothing to do.' },
        { status: 400 },
      );
    }
    if (request.status === 'completed') {
      return NextResponse.json({ error: 'That withdrawal has already been sent.' }, { status: 409 });
    }

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
    await tellThem(data, 'rejected');
    return NextResponse.json({ request: data });
  }

  if (action === 'process') {
    // Money only leaves against a decision. Processing a `pending` request would skip approval
    // entirely, and processing a `rejected` or `completed` one would pay it out after it was
    // refused, or twice.
    if (request.status !== 'approved' && request.status !== 'processing') {
      return NextResponse.json(
        { error: `Only an approved withdrawal can be sent — this one is ${request.status}.` },
        { status: 409 },
      );
    }
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
    await tellThem(data, 'completed');
    return NextResponse.json({ request: data, new_balance: balanceAfter });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}, { routeName: 'payroll/balance' });

/**
 * Tell the employee what happened to their request.
 *
 * Best-effort and never throwing: this runs after the decision — and, for `completed`, after the
 * money has already come off the balance. A push failure must not turn a sent withdrawal into a 500
 * that invites somebody to retry it.
 *
 * Every transition notifies. Silence on a request for your own wages is indistinguishable from the
 * system being broken, which is the state this endpoint has been in since it was written.
 */
async function tellThem(
  row: { user_email?: string | null; amount?: number | null; destination?: string | null; rejection_reason?: string | null } | null,
  outcome: 'approved' | 'rejected' | 'completed' | 'cancelled',
): Promise<void> {
  try {
    const n = buildWithdrawalNotification({
      userEmail: row?.user_email,
      outcome,
      amount: row?.amount == null ? null : Number(row.amount),
      destination: row?.destination,
      reason: row?.rejection_reason,
    });
    if (n) await notify(n);
  } catch (err) {
    console.error('[payroll/balance] could not notify about a withdrawal:', err instanceof Error ? err.message : String(err));
  }
}
