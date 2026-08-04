// app/api/admin/time-logs/pay-decision/route.ts
//
// THE APPROVER'S PAY DECISION (owner request, 2026-08-04)
// ══════════════════════════════════════════════════════
//
// *"Whenever hours come in, the boss should be able to see what that employee's base pay is
// automatically, and should have a reference for all of the other activities' pay levels too…
// The boss, or whoever is handling the payments, can add notes to the payout."*
//
//   GET  ?id=<time_log_id>   — the entry, the submitter's whole rate menu, and any existing
//                              decision. Everything needed to decide, in one call.
//   POST                     — save a decision (blocks + note). Replaces any previous one, keeping
//                              the old version in `time_log_pay_decision_history`.
//   DELETE ?id=<time_log_id> — withdraw a decision, returning the entry to the rules' own figure.
//
// The rules live in `lib/payroll/pay-decision.ts`; this file is the gate, the read and the write.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import { loadPayConfig, loadPersonPayFacts, rateMenuFor } from '@/lib/payroll/pay-context';
import { buildPayDecision, defaultDecisionBlocks, describeDecision, type PayBlock } from '@/lib/payroll/pay-decision';
import { UNSPECIFIED_WORK_TYPE } from '@/lib/payroll/resolve-rate';

interface TimeLogRow {
  id: string;
  user_email: string;
  log_date: string;
  work_type: string;
  hours: number;
  adjusted_hours: number | null;
  description: string;
  status: string;
  effective_rate: number | null;
  total_pay: number | null;
}

/** The hours a decision must account for: the approver's adjustment when there is one, else what was submitted. */
function payableHours(log: TimeLogRow): number {
  return log.adjusted_hours != null ? Number(log.adjusted_hours) : Number(log.hours);
}

// GET: everything needed to decide one entry's pay.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: log, error } = await supabaseAdmin
    .from('daily_time_logs')
    .select('id, user_email, log_date, work_type, hours, adjusted_hours, description, status, effective_rate, total_pay')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!log) return NextResponse.json({ error: 'Time log not found' }, { status: 404 });

  const entry = log as TimeLogRow;

  // An employee may read the decision on their OWN hours — they are the person it pays, and an
  // unexplained adjustment is what generates a dispute. Only an admin may read anybody else's.
  if (!isAdmin(session.user.roles) && entry.user_email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const config = await loadPayConfig();
  const person = await loadPersonPayFacts(entry.user_email, config);

  // *"should be able to see what that employee's base pay is automatically, and should have a
  // reference for all of the other activities' pay levels too"* — this is that reference, priced
  // for THIS employee rather than shown as the firm's list prices.
  const menu = rateMenuFor(person, config);

  const { data: existing } = await supabaseAdmin
    .from('time_log_pay_decisions')
    .select('*')
    .eq('time_log_id', id)
    .maybeSingle();

  const { data: history } = await supabaseAdmin
    .from('time_log_pay_decision_history')
    .select('blocks, total_pay, payout_note, decided_by, decided_at, superseded_at, superseded_by')
    .eq('time_log_id', id)
    .order('superseded_at', { ascending: false });

  // What the screen opens on when nothing has been decided: the rules' own answer for the activity
  // the employee logged, so the common case — agreeing — is one click.
  const hours = payableHours(entry);
  const loggedActivity = entry.work_type === UNSPECIFIED_WORK_TYPE ? null : entry.work_type;
  const resolvedForLogged = loggedActivity
    ? menu.activities.find((a) => a.work_type === loggedActivity)?.resolved ?? menu.base
    : menu.base;

  return NextResponse.json({
    log: entry,
    payable_hours: hours,
    person: {
      email: person.email,
      name: person.name,
      base_pay: person.basePay,
      tier_key: person.tierKey,
      tier_label: person.tierLabel,
      years_employed: person.yearsEmployed,
      band: person.band,
      has_profile: person.hasProfile,
    },
    menu,
    decision: existing ?? null,
    history: history ?? [],
    suggested_blocks: existing
      ? (existing as { blocks: PayBlock[] }).blocks
      : defaultDecisionBlocks(
          hours,
          resolvedForLogged,
          loggedActivity
            ? menu.activities.find((a) => a.work_type === loggedActivity)?.label ?? loggedActivity
            : 'Base pay',
          loggedActivity,
        ),
  });
}, { routeName: 'time-logs/pay-decision' });

// POST: record what the approver decided.
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Deciding somebody's pay is an admin act, full stop — including on your own hours, which is why
  // there is no self-service branch here as there is on GET.
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { time_log_id, blocks, payout_note } = body as {
    time_log_id?: string;
    blocks?: PayBlock[];
    payout_note?: string | null;
  };

  if (!time_log_id) return NextResponse.json({ error: 'time_log_id required' }, { status: 400 });

  const { data: log } = await supabaseAdmin
    .from('daily_time_logs')
    .select('id, user_email, log_date, work_type, hours, adjusted_hours, description, status, effective_rate, total_pay')
    .eq('id', time_log_id)
    .maybeSingle();

  if (!log) return NextResponse.json({ error: 'Time log not found' }, { status: 404 });
  const entry = log as TimeLogRow;

  const built = buildPayDecision({
    blocks: blocks ?? [],
    submittedHours: payableHours(entry),
    payoutNote: payout_note,
  });

  // The refusal sentence goes to a person, so it is returned as-is rather than flattened to a code.
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
  const decision = built.decision;

  // Keep the version being replaced. "What did it say before you changed it" needs an answer that
  // is not "we overwrote it" — pay changes are exactly the thing people revisit.
  const { data: previous } = await supabaseAdmin
    .from('time_log_pay_decisions')
    .select('*')
    .eq('time_log_id', time_log_id)
    .maybeSingle();

  if (previous) {
    const p = previous as Record<string, unknown>;
    await supabaseAdmin.from('time_log_pay_decision_history').insert({
      time_log_id,
      user_email: p.user_email,
      blocks: p.blocks,
      total_hours: p.total_hours,
      total_pay: p.total_pay,
      undecided_hours: p.undecided_hours,
      payout_note: p.payout_note,
      decided_by: p.decided_by,
      decided_at: p.decided_at,
      superseded_by: session.user.email,
    });
  }

  const { data: saved, error } = await supabaseAdmin
    .from('time_log_pay_decisions')
    .upsert({
      time_log_id,
      user_email: entry.user_email,
      blocks: decision.blocks,
      total_hours: decision.totalHours,
      total_pay: decision.totalPay,
      undecided_hours: decision.undecidedHours,
      payout_note: decision.payoutNote,
      decided_by: session.user.email,
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'time_log_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Tell the employee — but only when the decision differs from what the rules already said, or
  // carries a note. A bell for "we agreed with the standard rate" is noise, and noise is how people
  // learn to ignore the notifications that matter.
  const summary = describeDecision(decision, entry.total_pay);
  if (summary || decision.payoutNote) {
    try {
      await notify({
        user_email: entry.user_email,
        type: 'hours_pay_decided',
        title: `Pay set for ${entry.log_date}`,
        body: [summary, decision.payoutNote].filter(Boolean).join(' '),
        link: '/admin/my-hours',
        source_type: 'daily_time_logs',
        source_id: time_log_id,
      });
    } catch { /* a notification failure must not fail the decision */ }
  }

  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'time_log_pay_decided',
      entity_type: 'daily_time_logs',
      entity_id: time_log_id,
      metadata: {
        target: entry.user_email,
        total_pay: decision.totalPay,
        blocks: decision.blocks.length,
        revised: Boolean(previous),
      },
    });
  } catch { /* ignore */ }

  return NextResponse.json({ decision: saved, summary });
}, { routeName: 'time-logs/pay-decision' });

// DELETE: withdraw a decision, returning the entry to the rules' own figure.
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: previous } = await supabaseAdmin
    .from('time_log_pay_decisions')
    .select('*')
    .eq('time_log_id', id)
    .maybeSingle();

  if (!previous) return NextResponse.json({ error: 'No decision to withdraw' }, { status: 404 });

  // Withdrawing is still a change to somebody's pay, so it leaves the same trail a revision does.
  const p = previous as Record<string, unknown>;
  await supabaseAdmin.from('time_log_pay_decision_history').insert({
    time_log_id: id,
    user_email: p.user_email,
    blocks: p.blocks,
    total_hours: p.total_hours,
    total_pay: p.total_pay,
    undecided_hours: p.undecided_hours,
    payout_note: p.payout_note,
    decided_by: p.decided_by,
    decided_at: p.decided_at,
    superseded_by: session.user.email,
  });

  const { error } = await supabaseAdmin.from('time_log_pay_decisions').delete().eq('time_log_id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ withdrawn: true });
}, { routeName: 'time-logs/pay-decision' });
