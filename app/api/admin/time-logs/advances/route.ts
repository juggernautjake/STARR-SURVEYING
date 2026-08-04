// app/api/admin/time-logs/advances/route.ts — Pay advance requests
//
// ── AN ADVANCE HAS FOUR STATES, NOT TWO (pay consolidation C-17, 2026-08-04) ────────────────────
//
// *"Please make sure the week history and pay advances are totally built out and functional too."*
//
// This route could request, approve, deny and cancel. What it could not do was the thing that makes
// an advance an advance: come back out of a later paycheque. There was no repaid amount, no
// instalments, no 'paid' state, and nothing anywhere expecting the money back.
//
//   pending  → an employee has asked.
//   approved → somebody said yes. **The money has not moved.**
//   paid     → the money has actually been handed over. This is what starts recovery.
//   repaid   → the balance is clear. Set by the payroll run, not by hand.
//
// 'approved' and 'paid' stay separate deliberately. Collapsing them means a request that was
// blessed but never handed over still gets deducted from somebody's wages — the firm recovers money
// it never gave. `pay_advances_outstanding` filters to 'paid' for exactly that reason.
//
// GET returns each request with what is still outstanding against it, so both the employee and the
// approver read the same balance.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';

// GET: List advance requests
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const admin = isAdmin(session.user.roles);

  let query = supabaseAdmin
    .from('pay_advance_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (!admin) query = query.eq('user_email', session.user.email);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Outstanding is derived, not stored twice: `amount - repaid_amount`. Returned on every row so a
  // screen never has to compute money for itself, and so a partly-repaid advance reads as such
  // rather than as its original figure.
  const advances = (data ?? []).map((row: Record<string, unknown>) => {
    const amount = Number(row.amount ?? 0);
    const repaid = Number(row.repaid_amount ?? 0);
    return {
      ...row,
      repaid_amount: repaid,
      // Only a paid advance is owed. Clamped at zero so a data oddity cannot render as a negative
      // debt, which reads as the firm owing the employee.
      outstanding: row.status === 'paid' ? Math.max(0, Math.round((amount - repaid) * 100) / 100) : 0,
    };
  });

  const totalOutstanding = advances.reduce((sum: number, a: { outstanding: number }) => sum + a.outstanding, 0);

  return NextResponse.json({
    advances,
    total_outstanding: Math.round(totalOutstanding * 100) / 100,
  });
}, { routeName: 'time-logs/advances' });

// POST: Submit advance request (employee) or review (admin)
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const admin = isAdmin(session.user.roles);

  // Admin reviewing an existing request
  if (body.id && admin) {
    const { id, action, denial_reason, pay_date, notes, repay_per_period } = body as {
      id: string;
      action: 'approve' | 'deny' | 'mark_paid';
      denial_reason?: string;
      pay_date?: string;
      notes?: string;
      repay_per_period?: number;
    };

    const updateData: Record<string, unknown> = {
      reviewed_by: session.user.email,
      reviewed_at: new Date().toISOString(),
    };

    if (action === 'approve') {
      updateData.status = 'approved';
      updateData.pay_date = pay_date || new Date().toISOString().split('T')[0];
      if (notes) updateData.notes = notes;
      // How much comes back each pay period. Null means the whole balance comes out of the next
      // cheque, which is right for the small "$200 until Friday" case; a larger advance is spread
      // by setting a figure here. Either way a cheque is never emptied — see
      // `lib/payroll/advance-recovery.ts`.
      if (typeof repay_per_period === 'number' && repay_per_period > 0) {
        updateData.repay_per_period = repay_per_period;
      }
    } else if (action === 'mark_paid') {
      // The money has actually left. Only now does the advance become recoverable, and only now
      // does it appear in `pay_advances_outstanding`.
      updateData.status = 'paid';
      updateData.paid_at = new Date().toISOString();
      if (notes) updateData.notes = notes;
    } else {
      updateData.status = 'denied';
      updateData.denial_reason = denial_reason || 'Denied by admin';
    }

    const { data, error } = await supabaseAdmin
      .from('pay_advance_requests')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // The employee is waiting on this answer — it is money they asked for. A decision nobody is
    // told about is the same as no decision until they next happen to open the page.
    try {
      const advance = data as { user_email: string; amount: number; denial_reason: string | null };
      const title = action === 'approve' ? 'Pay advance approved'
        : action === 'mark_paid' ? 'Pay advance paid'
        : 'Pay advance declined';
      const message = action === 'approve'
        ? `Your $${Number(advance.amount).toFixed(2)} advance was approved. It will be recovered from an upcoming paycheque.`
        : action === 'mark_paid'
          ? `Your $${Number(advance.amount).toFixed(2)} advance has been paid out.`
          : `Your $${Number(advance.amount).toFixed(2)} advance was declined. ${advance.denial_reason ?? ''}`.trim();

      await notify({
        user_email: advance.user_email,
        type: 'pay_advance_decision',
        title,
        body: message,
        link: '/admin/my-hours',
        source_type: 'pay_advance_requests',
        source_id: id,
      });
    } catch { /* a notification failure must not fail the decision */ }

    return NextResponse.json({ advance: data });
  }

  // Employee submitting new request
  const { amount, reason } = body as { amount: number; reason: string };
  if (!amount || amount <= 0) return NextResponse.json({ error: 'Valid amount required' }, { status: 400 });
  if (!reason?.trim()) return NextResponse.json({ error: 'Reason is required' }, { status: 400 });

  // One open request at a time. Without this a person can stack requests faster than anybody
  // reviews them, and the approver sees a queue with no way to tell it is the same need asked four
  // times. Refused with the existing request named, so the answer is obvious.
  const { data: open } = await supabaseAdmin
    .from('pay_advance_requests')
    .select('id, amount, status')
    .eq('user_email', session.user.email)
    .in('status', ['pending', 'approved'])
    .maybeSingle();

  if (open) {
    const existing = open as { amount: number; status: string };
    return NextResponse.json({
      error: `You already have a $${Number(existing.amount).toFixed(2)} advance request ${existing.status}. ` +
             `Wait for it to be paid out, or cancel it, before asking for another.`,
    }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin
    .from('pay_advance_requests')
    .insert({
      user_email: session.user.email,
      amount,
      reason: reason.trim(),
      status: 'pending',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'advance_requested',
      entity_type: 'pay_advance_requests',
      entity_id: data.id,
      metadata: { amount },
    });
  } catch { /* ignore */ }

  return NextResponse.json({ advance: data }, { status: 201 });
}, { routeName: 'time-logs/advances' });

// DELETE: Cancel own pending advance request
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: existing } = await supabaseAdmin
    .from('pay_advance_requests')
    .select('user_email, status')
    .eq('id', id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const admin = isAdmin(session.user.roles);
  if (!admin && existing.user_email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!admin && existing.status !== 'pending') {
    return NextResponse.json({ error: 'Can only cancel pending requests' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('pay_advance_requests')
    .update({ status: 'cancelled' })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'time-logs/advances' });
