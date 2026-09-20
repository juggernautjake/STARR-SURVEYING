// app/api/admin/time-logs/approve/route.ts — Bulk approval actions for admins
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import { buildHoursDecisionNotifications } from '@/lib/notifications/hours-decision';

// POST: Bulk approve/reject time logs
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { ids, action, rejection_reason } = body as {
    ids: string[];
    action: 'approve' | 'reject' | 'mark_paid' | 'mark_unpaid';
    rejection_reason?: string;
  };

  if (!ids?.length || !action) {
    return NextResponse.json({ error: 'ids and action required' }, { status: 400 });
  }

  const now = new Date().toISOString();

  // ── MARKING HOURS PAID (owner, 2026-09-19) ─────────────────────────────────────────────────
  //
  // "I want it so that we can mark hours as approved and as paid. Eventually we will link this to
  // the payroll system so that once the hours are approved, the admin can run the payroll to pay
  // people for whatever hours they have that have been approved."
  //
  // Handled before the approve/reject path because it touches different columns and must NOT
  // rewrite `approved_by` / `approved_at`. Paying for hours is not re-approving them, and
  // overwriting who approved them with whoever pressed Pay would destroy the audit trail that
  // makes a wage dispute answerable.
  if (action === 'mark_paid' || action === 'mark_unpaid') {
    const paying = action === 'mark_paid';

    if (paying) {
      // Only approved hours may be paid. Checked here rather than as a CHECK constraint so that
      // un-approving something already paid stays a repairable mistake rather than a constraint
      // failure with somebody's wages behind it — see seeds/651.
      //
      // 'adjusted' counts: an approver changed the figure and accepted it, which is a decision.
      const { data: rows } = await supabaseAdmin
        .from('daily_time_logs')
        .select('id, status')
        .in('id', ids);
      const notApproved = ((rows ?? []) as Array<{ id: string; status: string | null }>).filter(
        (r) => r.status !== 'approved' && r.status !== 'adjusted',
      );
      if (notApproved.length > 0) {
        return NextResponse.json({
          error: `${notApproved.length} of these ${notApproved.length === 1 ? 'entry has' : 'entries have'} not been approved yet. Approve them first, then mark them paid.`,
        }, { status: 400 });
      }
    }

    const { data: paidRows, error: paidError } = await supabaseAdmin
      .from('daily_time_logs')
      .update(paying
        // `payout_batch_id` stays null: a person did this, not a payroll run. When a run does the
        // marking it stamps its batch, and the two cases remain distinguishable forever.
        ? { paid_at: now, paid_by: session.user.email, updated_at: now }
        : { paid_at: null, paid_by: null, payout_batch_id: null, updated_at: now })
      .in('id', ids)
      .select();

    if (paidError) return NextResponse.json({ error: paidError.message }, { status: 500 });

    try {
      await supabaseAdmin.from('activity_log').insert({
        user_email: session.user.email,
        action_type: `time_logs_bulk_${action}`,
        entity_type: 'daily_time_logs',
        entity_id: ids[0],
        metadata: { count: ids.length, action },
      });
    } catch { /* ignore */ }

    return NextResponse.json({ updated: paidRows?.length || 0, logs: paidRows || [] });
  }

  const updateData: Record<string, unknown> = {
    approved_by: session.user.email,
    approved_at: now,
    updated_at: now,
  };

  if (action === 'approve') {
    updateData.status = 'approved';
  } else {
    updateData.status = 'rejected';
    updateData.rejection_reason = rejection_reason || 'Rejected by admin';
  }

  const { data, error } = await supabaseAdmin
    .from('daily_time_logs')
    .update(updateData)
    .in('id', ids)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // hub-widget-excellence-03 Slice 2 — tell the submitter their hours
  // were approved/rejected (one bell per worker, not per row). Best-
  // effort: a notification failure must not fail the approval.
  try {
    const notifications = buildHoursDecisionNotifications(data ?? [], action === 'approve');
    await Promise.all(notifications.map((n) => notify(n)));
  } catch { /* ignore notification failures */ }

  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: `time_logs_bulk_${action}`,
      entity_type: 'daily_time_logs',
      entity_id: ids[0],
      metadata: { count: ids.length, action },
    });
  } catch { /* ignore */ }

  return NextResponse.json({ updated: data?.length || 0, logs: data || [] });
}, { routeName: 'time-logs/approve' });
