// app/api/admin/time-logs/route.ts — Daily time log CRUD + pay calculation
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import {
  buildHoursDecisionNotifications,
  buildHoursAdjustmentNotification,
} from '@/lib/notifications/hours-decision';
import { isDateLocked } from '@/lib/hours/period-lock';
import { canEmployeeEdit, canEmployeeDelete } from '@/lib/hours/permissions';
import { loadPayConfig, loadPersonPayFacts, rateFor } from '@/lib/payroll/pay-context';
import { UNSPECIFIED_WORK_TYPE } from '@/lib/payroll/resolve-rate';

const LOCKED_MSG =
  'That pay period is locked. Ask a manager to adjust these hours — they can revise locked entries.';

// ── THE FOURTH COPY OF THE PAY FORMULA, RETIRED (owner request, 2026-08-04) ──────────────────
//
// *"We need one central consolidated model for all payments."*
//
// This file used to carry ~127 lines of private `getPayConfig` + `calculateEffectiveRate`: the
// fourth independent implementation of "what does this hour cost", and the one that actually
// stamped a rate onto submitted hours. It differed from the designed model in ways nobody could
// see from the outside:
//
//   • It matched a tier with `.eq('role_key', profile.job_title)` and **no alias bridge**, so a
//     profile reading 'survey_technician' matched no row in `role_tiers` (whose key is
//     'survey_tech') and silently lost its $6/hr role bonus.
//   • It ignored `user_pay_overrides` entirely, so a person on a pinned custom rate had their
//     hours logged at the formula rate anyway.
//   • It never consulted `employee_profiles.hourly_rate`, so an agreed $25 could be logged at the
//     $16 driving rate.
//   • It issued six sequential queries per entry, so a five-line timesheet was thirty round-trips.
//
// It is now `lib/payroll/resolve-rate.ts` through `lib/payroll/pay-context.ts`, the same call the
// rate picker and the approval screen make. See the header of `resolve-rate.ts` for the model.

// GET: List time logs — employees see own, admins see all (with filters)
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  const status = searchParams.get('status');
  const weekStart = searchParams.get('week_start');

  const admin = isAdmin(session.user.roles);

  // Non-admins can only view their own
  if (!admin && email && email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let query = supabaseAdmin
    .from('daily_time_logs')
    .select('*')
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false });

  const targetEmail = admin ? email : session.user.email;
  if (targetEmail) query = query.eq('user_email', targetEmail);
  if (!admin) query = query.eq('user_email', session.user.email);

  if (dateFrom) query = query.gte('log_date', dateFrom);
  if (dateTo) query = query.lte('log_date', dateTo);
  // `status` accepts a single value or a comma list (e.g. "pending,disputed")
  // so the review queue can pull everything that needs an admin decision.
  if (status) {
    const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
    query = statuses.length > 1 ? query.in('status', statuses) : query.eq('status', statuses[0]);
  }
  if (weekStart) {
    const ws = new Date(weekStart);
    const we = new Date(ws);
    we.setDate(we.getDate() + 6);
    query = query.gte('log_date', ws.toISOString().split('T')[0]).lte('log_date', we.toISOString().split('T')[0]);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also fetch work type rates for display
  const { data: workTypes } = await supabaseAdmin
    .from('work_type_rates')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  return NextResponse.json({ logs: data || [], work_types: workTypes || [] });
}, { routeName: 'time-logs' });

// POST: Submit daily time log entries
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { entries } = body as {
    entries: Array<{
      log_date: string;
      work_type?: string | null;
      hours: number;
      job_id?: string;
      job_name?: string;
      description: string;
      notes?: string;
      role_on_job?: string | null;
    }>;
  };

  if (!entries || !entries.length) {
    return NextResponse.json({ error: 'No entries provided' }, { status: 400 });
  }

  // Validate total hours per date don't exceed 24
  const hoursByDate = new Map<string, number>();
  for (const e of entries) {
    // ── work_type IS NO LONGER REQUIRED (owner request, 2026-08-04) ─────────────────────────
    //
    // *"We should also be able to submit the hours without any payment option and the boss can
    // decide what is fair."*
    //
    // Requiring an activity forced everybody to pick a rate at submission time — which is the
    // moment they know least about how the day should be paid, and the least authority to decide.
    // An entry with no activity is now legitimate: it resolves to the person's agreed base pay, or
    // to `unset` if they have none, and lands in front of whoever approves it either way.
    if (!e.log_date || !e.hours || !e.description) {
      return NextResponse.json({ error: 'Each entry needs log_date, hours, and description' }, { status: 400 });
    }
    if (e.hours <= 0 || e.hours > 24) {
      return NextResponse.json({ error: 'Hours must be between 0 and 24' }, { status: 400 });
    }
    hoursByDate.set(e.log_date, (hoursByDate.get(e.log_date) || 0) + e.hours);
  }
  for (const [date, total] of hoursByDate) {
    if (total > 24) {
      return NextResponse.json({ error: `Total hours for ${date} exceed 24 (${total})` }, { status: 400 });
    }
  }

  // Employees can't submit/resubmit hours into a locked pay period.
  if (!isAdmin(session.user.roles)) {
    for (const date of hoursByDate.keys()) {
      if (await isDateLocked(date)) {
        return NextResponse.json({ error: LOCKED_MSG }, { status: 423 });
      }
    }
  }

  // Config and the submitter's facts are read ONCE for the whole timesheet, not once per entry per
  // table. The retired inline calculator did six sequential queries per entry.
  const payConfig = await loadPayConfig();
  const payFacts = await loadPersonPayFacts(session.user.email, payConfig);

  const results = [];
  for (const entry of entries) {
    const resolved = rateFor(payFacts, payConfig, {
      workType: entry.work_type,
      roleOnJob: entry.role_on_job,
    });
    const breakdown = resolved.breakdown;

    const { data, error } = await supabaseAdmin
      .from('daily_time_logs')
      .insert({
        user_email: session.user.email,
        log_date: entry.log_date,
        // NOT NULL in the schema, so an entry with no activity is stored as the explicit sentinel
        // rather than as an empty string. 'unspecified' matches no row in `work_type_rates`, which
        // is exactly what makes it resolve to base pay.
        work_type: entry.work_type || UNSPECIFIED_WORK_TYPE,
        hours: entry.hours,
        job_id: entry.job_id || null,
        job_name: entry.job_name || null,
        description: entry.description,
        notes: entry.notes || null,
        status: 'pending',
        base_rate: breakdown?.baseRate ?? null,
        role_bonus: breakdown?.roleBonus ?? null,
        seniority_bonus: breakdown?.seniorityBonus ?? null,
        credential_bonus: (breakdown?.credentialBonusCapped ?? 0) + (breakdown?.xpBonusCapped ?? 0) || null,
        effective_rate: resolved.rate,
        // Null, not zero, when no rate is set. A zero here would total into a pay period as
        // "worked for free" instead of "waiting on a decision", and the difference is somebody's
        // wages.
        total_pay: resolved.rate === null ? null : Math.round(resolved.rate * entry.hours * 100) / 100,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    results.push(data);
  }

  // Log activity
  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'time_logs_submitted',
      entity_type: 'daily_time_logs',
      entity_id: results[0]?.id,
      metadata: { count: results.length, dates: [...hoursByDate.keys()] },
    });
  } catch { /* ignore */ }

  return NextResponse.json({ logs: results }, { status: 201 });
}, { routeName: 'time-logs' });

// PUT: Update a time log (employee can edit pending, admin can approve/reject/adjust)
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, action, ...updates } = body as {
    id: string;
    action?: 'approve' | 'reject' | 'adjust' | 'dispute';
    hours?: number;
    description?: string;
    notes?: string;
    rejection_reason?: string;
    adjustment_note?: string;
    adjusted_hours?: number;
  };

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Fetch existing log
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('daily_time_logs')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Log not found' }, { status: 404 });

  const admin = isAdmin(session.user.roles);

  // Admin approval actions
  if (action && admin) {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (action === 'approve') {
      updateData.status = 'approved';
      updateData.approved_by = session.user.email;
      updateData.approved_at = new Date().toISOString();
    } else if (action === 'reject') {
      updateData.status = 'rejected';
      updateData.approved_by = session.user.email;
      updateData.approved_at = new Date().toISOString();
      updateData.rejection_reason = updates.rejection_reason || 'Rejected by admin';
    } else if (action === 'adjust') {
      updateData.status = 'adjusted';
      updateData.approved_by = session.user.email;
      updateData.approved_at = new Date().toISOString();
      updateData.adjustment_note = updates.adjustment_note || '';
      updateData.adjusted_hours = updates.adjusted_hours;
      // Recalculate pay with adjusted hours
      if (updates.adjusted_hours) {
        updateData.total_pay = (existing.effective_rate || 0) * updates.adjusted_hours;
      }
    }

    const { data, error } = await supabaseAdmin
      .from('daily_time_logs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    try {
      await supabaseAdmin.from('activity_log').insert({
        user_email: session.user.email,
        action_type: `time_log_${action}`,
        entity_type: 'daily_time_logs',
        entity_id: id,
        metadata: { employee: existing.user_email, action },
      });
    } catch { /* ignore */ }

    // Notify the employee of the decision. Single-entry approve/reject/adjust
    // previously sent nothing (only the bulk approve route notified); adjust in
    // particular must tell the worker the new hours + reason. Best-effort — a
    // notification failure must not fail the decision.
    try {
      if (action === 'adjust') {
        const n = buildHoursAdjustmentNotification({
          user_email: existing.user_email,
          log_date: existing.log_date,
          original_hours: existing.hours,
          adjusted_hours: updates.adjusted_hours,
          reason: updates.adjustment_note,
        });
        if (n) await notify(n);
      } else if (action === 'approve' || action === 'reject') {
        const [n] = buildHoursDecisionNotifications([existing], action === 'approve');
        if (n) await notify(n);
      }
    } catch { /* ignore notification failures */ }

    return NextResponse.json({ log: data });
  }

  // Employee dispute
  if (action === 'dispute' && existing.user_email === session.user.email) {
    const { data, error } = await supabaseAdmin
      .from('daily_time_logs')
      .update({
        status: 'disputed',
        notes: updates.notes || existing.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ log: data });
  }

  // Employee editing their own pending entry
  if (existing.user_email !== session.user.email && !admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!admin && !canEmployeeEdit(existing.status)) {
    return NextResponse.json({ error: 'Can only edit pending or rejected entries' }, { status: 400 });
  }
  if (!admin && (await isDateLocked(existing.log_date))) {
    return NextResponse.json({ error: LOCKED_MSG }, { status: 423 });
  }

  const editUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.hours !== undefined) editUpdates.hours = updates.hours;
  if (updates.description !== undefined) editUpdates.description = updates.description;
  if (updates.notes !== undefined) editUpdates.notes = updates.notes;

  // If hours changed, recalculate
  if (updates.hours !== undefined) {
    editUpdates.total_pay = (existing.effective_rate || 0) * updates.hours;
    editUpdates.status = 'pending'; // re-submit for approval
  }

  const { data, error } = await supabaseAdmin
    .from('daily_time_logs')
    .update(editUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ log: data });
}, { routeName: 'time-logs' });

// DELETE: Remove a pending/rejected time log (employee own, or admin any)
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: existing } = await supabaseAdmin
    .from('daily_time_logs')
    .select('user_email, status')
    .eq('id', id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const admin = isAdmin(session.user.roles);
  if (!admin && existing.user_email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // Employees may remove their own pending OR rejected logs — a rejected
  // log is theirs to fix (the my-hours "edit & resubmit" flow deletes the
  // old editable rows and re-creates them). Approved/adjusted/disputed logs
  // are locked and can only be changed by an admin.
  if (!admin && !canEmployeeDelete(existing.status)) {
    return NextResponse.json({ error: 'Can only delete pending or rejected entries' }, { status: 400 });
  }
  if (!admin && (await isDateLocked(existing.log_date))) {
    return NextResponse.json({ error: LOCKED_MSG }, { status: 423 });
  }

  const { error } = await supabaseAdmin.from('daily_time_logs').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}, { routeName: 'time-logs' });
